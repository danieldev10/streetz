import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventStatus, PaymentPurpose, PaymentStatus, Prisma, SubscriptionStatus, TicketStatus, UserRole } from "@prisma/client";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  CONFIRMED_TICKET_STATUSES,
  DEFAULT_TICKET_RESERVATION_MINUTES,
  getActiveTicketWhere,
  getExpiredReservationWhere,
  getReservationExpiry
} from "../events/ticket-reservations";
import { BookEventDto } from "../events/dto/book-event.dto";
import { EVENT_TICKET_TIER_NAMES } from "../events/dto/create-event.dto";
import { PrismaService } from "../prisma/prisma.service";
import { getAccountAccessBlock } from "../users/account-status";

const SUBSCRIPTION_AMOUNT_KOBO = 100_000;
const SUBSCRIPTION_DAYS = 30;
const RESERVATION_CLEANUP_INTERVAL_MS = 5 * 60_000;
const REGULAR_TICKET_NAME = "Regular";

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
    paid_at?: string;
    channel?: string;
    gateway_response?: string;
    customer?: {
      email?: string;
    };
  };
};

type PaystackWebhookBody = {
  event?: string;
  data?: {
    reference?: string;
  };
};

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private reservationCleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    this.runReservationCleanup();
    const timer = setInterval(() => this.runReservationCleanup(), RESERVATION_CLEANUP_INTERVAL_MS);

    if (typeof timer === "object" && typeof timer.unref === "function") {
      timer.unref();
    }

    this.reservationCleanupTimer = timer;
  }

  onModuleDestroy() {
    if (this.reservationCleanupTimer) {
      clearInterval(this.reservationCleanupTimer);
      this.reservationCleanupTimer = null;
    }
  }

  async initializeSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("User not found.");
    }

    const accountBlock = getAccountAccessBlock(user);

    if (accountBlock) {
      throw new ForbiddenException(accountBlock);
    }

    if (user.subscriptionStatus === SubscriptionStatus.ACTIVE && user.subscriptionEndsAt && user.subscriptionEndsAt > new Date()) {
      return {
        alreadyActive: true,
        subscriptionEndsAt: user.subscriptionEndsAt
      };
    }

    const reference = this.createReference();
    const callbackUrl = `${this.config.getOrThrow<string>("WEB_APP_URL")}/payment/callback`;

    const response = await this.callPaystack<PaystackInitializeResponse>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: SUBSCRIPTION_AMOUNT_KOBO,
        email: user.email,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: {
          userId,
          purpose: PaymentPurpose.SUBSCRIPTION,
          product: "crushclub monthly membership"
        }
      })
    });

    if (!response.status || !response.data?.authorization_url) {
      throw new BadRequestException(response.message || "Unable to initialize Paystack transaction.");
    }

    await this.prisma.payment.create({
      data: {
        userId,
        purpose: PaymentPurpose.SUBSCRIPTION,
        amountKobo: SUBSCRIPTION_AMOUNT_KOBO,
        providerReference: reference,
        providerMetadata: {
          accessCode: response.data.access_code
        }
      }
    });

    return {
      authorizationUrl: response.data.authorization_url,
      accessCode: response.data.access_code,
      reference
    };
  }

  async verifySubscriptionPayment(userId: string, reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference }
    });

    if (!payment || payment.userId !== userId || payment.purpose !== PaymentPurpose.SUBSCRIPTION) {
      throw new ForbiddenException("Payment reference is not valid for this user.");
    }

    return this.verifyAndActivateSubscription(reference);
  }

  async initializeEventTicket(userId: string, eventId: string, dto: BookEventDto = {}) {
    const user = await this.ensureActiveTicketBuyer(userId);
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        ...this.getBookableEventWhere(now)
      },
      include: {
        ticketTypes: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!event) {
      throw new BadRequestException("Event is not available.");
    }

    const ticketType = this.getRequestedTicketType(event.ticketTypes, dto.ticketTypeId);

    if (ticketType.priceKobo <= 0) {
      throw new BadRequestException("This event is free. Book it from the event page.");
    }

    const quantity = this.getTicketQuantity(dto.quantity);
    const reservedUntil = getReservationExpiry(now, this.getTicketReservationMinutes());
    const tickets = await this.prisma.$transaction(async (transaction) => {
      await this.cleanupExpiredTicketReservations(transaction, now);
      await this.lockTicketType(transaction, ticketType.id);
      await transaction.ticket.deleteMany({
        where: {
          userId,
          eventId,
          status: TicketStatus.RESERVED
        }
      });

      const [activeTickets, userOwnedTickets] = await Promise.all([
        transaction.ticket.count({
          where: {
            ticketTypeId: ticketType.id,
            ...getActiveTicketWhere(now)
          }
        }),
        transaction.ticket.count({
          where: {
            userId,
            eventId,
            status: { in: CONFIRMED_TICKET_STATUSES }
          }
        })
      ]);

      this.assertTicketPurchaseAvailability({
        quantity,
        activeTickets,
        capacity: ticketType.capacity,
        userOwnedTickets,
        maxTicketsPerUser: ticketType.maxTicketsPerUser
      });

      return Promise.all(
        Array.from({ length: quantity }, () =>
          transaction.ticket.create({
            data: {
              eventId,
              userId,
              ticketTypeId: ticketType.id,
              code: this.createTicketCode(),
              status: TicketStatus.RESERVED,
              reservedUntil
            }
          })
        )
      );
    });
    const ticketIds = tickets.map((ticket) => ticket.id);
    const primaryTicket = tickets[0];

    const reference = this.createReference("STZTIX");
    const callbackUrl = `${this.config.getOrThrow<string>("WEB_APP_URL")}/payment/callback?purpose=event-ticket&eventId=${encodeURIComponent(eventId)}`;

    try {
      const response = await this.callPaystack<PaystackInitializeResponse>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          amount: ticketType.priceKobo * quantity,
          email: user.email,
          currency: "NGN",
          reference,
          callback_url: callbackUrl,
          metadata: {
            userId,
            eventId,
            ticketId: primaryTicket.id,
            ticketIds,
            ticketTypeId: ticketType.id,
            ticketTypeName: this.normalizeTicketTypeName(ticketType.name),
            quantity,
            purpose: PaymentPurpose.EVENT_TICKET,
            product: event.title
          }
        })
      });

      if (!response.status || !response.data?.authorization_url) {
        throw new BadRequestException(response.message || "Unable to initialize Paystack transaction.");
      }

      await this.prisma.payment.create({
        data: {
          userId,
          purpose: PaymentPurpose.EVENT_TICKET,
          amountKobo: ticketType.priceKobo * quantity,
          providerReference: reference,
          providerMetadata: {
            accessCode: response.data.access_code,
            eventId,
            ticketId: primaryTicket.id,
            ticketIds,
            ticketTypeId: ticketType.id,
            ticketTypeName: this.normalizeTicketTypeName(ticketType.name),
            quantity
          }
        }
      });

      return {
        authorizationUrl: response.data.authorization_url,
        accessCode: response.data.access_code,
        reference,
        ticketId: primaryTicket.id,
        ticketIds,
        quantity
      };
    } catch (error) {
      await this.prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }).catch(() => null);

      throw error;
    }
  }

  async verifyEventTicketPayment(userId: string, reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference }
    });

    if (!payment || payment.userId !== userId || payment.purpose !== PaymentPurpose.EVENT_TICKET) {
      throw new ForbiddenException("Payment reference is not valid for this user.");
    }

    return this.verifyAndActivateEventTicket(reference);
  }

  async handlePaystackWebhook(signature: string | undefined, rawBody: Buffer | undefined, body: unknown) {
    if (!signature || !rawBody || !this.isValidSignature(signature, rawBody)) {
      throw new UnauthorizedException("Invalid Paystack webhook signature.");
    }

    const event = body as PaystackWebhookBody;
    const reference = event.data?.reference;

    if (reference && ["charge.success", "transaction.success", "transaction.successful"].includes(event.event ?? "")) {
      await this.verifyPaymentReference(reference);
    }

    return { received: true };
  }

  private async verifyAndActivateSubscription(reference: string) {
    const response = await this.callPaystack<PaystackVerifyResponse>(`/transaction/verify/${reference}`, {
      method: "GET"
    });

    if (!response.status || !response.data) {
      throw new BadRequestException(response.message || "Unable to verify Paystack transaction.");
    }

    const paystackData = response.data;
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference },
      include: { user: true }
    });

    if (!payment) {
      throw new BadRequestException("Payment record not found.");
    }

    if (paystackData.status !== "success") {
      const mappedStatus = this.mapPaystackStatus(paystackData.status);

      await this.prisma.payment.update({
        where: { providerReference: reference },
        data: {
          status: mappedStatus,
          providerMetadata: paystackData
        }
      });

      return {
        status: mappedStatus,
        subscriptionStatus: payment.user.subscriptionStatus,
        subscriptionEndsAt: payment.user.subscriptionEndsAt
      };
    }

    if (paystackData.amount !== payment.amountKobo || paystackData.currency !== "NGN") {
      throw new BadRequestException("Verified payment amount or currency does not match crushclub membership.");
    }

    const now = new Date();
    const activeUntil = payment.user.subscriptionEndsAt && payment.user.subscriptionEndsAt > now
      ? payment.user.subscriptionEndsAt
      : now;
    const subscriptionEndsAt = new Date(activeUntil);
    subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + SUBSCRIPTION_DAYS);

    const [, user] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { providerReference: reference },
        data: {
          status: PaymentStatus.SUCCESS,
          providerMetadata: paystackData
        }
      }),
      this.prisma.user.update({
        where: { id: payment.userId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEndsAt
        }
      })
    ]);

    return {
      status: PaymentStatus.SUCCESS,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionEndsAt: user.subscriptionEndsAt
    };
  }

  private async verifyAndActivateEventTicket(reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference },
      include: {
        user: true
      }
    });

    if (!payment) {
      throw new BadRequestException("Payment record not found.");
    }

    if (payment.purpose !== PaymentPurpose.EVENT_TICKET) {
      throw new BadRequestException("Payment reference is not for an event ticket.");
    }

    const metadata = this.getProviderMetadata(payment.providerMetadata);
    const legacyTicketId = typeof metadata.ticketId === "string" ? metadata.ticketId : null;
    const ticketIds = Array.isArray(metadata.ticketIds)
      ? metadata.ticketIds.filter((value): value is string => typeof value === "string")
      : legacyTicketId
        ? [legacyTicketId]
        : [];

    if (ticketIds.length === 0) {
      throw new BadRequestException("Ticket reference is missing from this payment.");
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      include: {
        ticketType: true,
        event: true
      }
    });
    const orderedTickets = ticketIds
      .map((ticketId) => tickets.find((ticket) => ticket.id === ticketId))
      .filter((ticket): ticket is (typeof tickets)[number] => Boolean(ticket));
    const ticket = orderedTickets[0] ?? null;

    if (orderedTickets.length !== ticketIds.length || orderedTickets.some((item) => item.userId !== payment.userId) || !ticket) {
      const refundMessage = "Payment received, but this ticket reservation is no longer available. Refunds are being processed and we will contact you by email.";

      if (payment.status !== PaymentStatus.PENDING) {
        return {
          status: payment.status,
          refundRequired: metadata.refundRequired === true,
          message: metadata.refundRequired === true ? refundMessage : undefined
        };
      }

      const response = await this.callPaystack<PaystackVerifyResponse>(`/transaction/verify/${reference}`, {
        method: "GET"
      });

      if (!response.status || !response.data) {
        throw new BadRequestException(response.message || "Unable to verify Paystack transaction.");
      }

      const paystackData = response.data;

      if (paystackData.status !== "success") {
        const mappedStatus = this.mapPaystackStatus(paystackData.status);

        await this.prisma.payment.update({
          where: { providerReference: reference },
          data: {
            status: mappedStatus,
            providerMetadata: {
              ...metadata,
              paystack: paystackData
            }
          }
        });

        return { status: mappedStatus };
      }

      if (paystackData.amount !== payment.amountKobo || paystackData.currency !== "NGN") {
        throw new BadRequestException("Verified payment amount or currency does not match this event ticket.");
      }

      await this.prisma.payment.update({
        where: { providerReference: reference },
        data: {
          status: PaymentStatus.SUCCESS,
          providerMetadata: {
            ...metadata,
            paystack: paystackData,
            refundRequired: true,
            refundReason: "Ticket reservation is no longer available."
          }
        }
      });

      return {
        status: PaymentStatus.SUCCESS,
        refundRequired: true,
        message: refundMessage
      };
    }

    if (payment.status === PaymentStatus.SUCCESS && orderedTickets.every((item) => CONFIRMED_TICKET_STATUSES.includes(item.status))) {
      return {
        status: PaymentStatus.SUCCESS,
        ticket: this.formatTicket(ticket),
        tickets: orderedTickets.map((item) => this.formatTicket(item))
      };
    }

    const response = await this.callPaystack<PaystackVerifyResponse>(`/transaction/verify/${reference}`, {
      method: "GET"
    });

    if (!response.status || !response.data) {
      throw new BadRequestException(response.message || "Unable to verify Paystack transaction.");
    }

    const paystackData = response.data;

    if (paystackData.status !== "success") {
      const mappedStatus = this.mapPaystackStatus(paystackData.status);

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { providerReference: reference },
          data: {
            status: mappedStatus,
            providerMetadata: {
              ...metadata,
              paystack: paystackData
            }
          }
        }),
        this.prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } })
      ]);

      return {
        status: mappedStatus,
        ticket: this.formatTicket({ ...ticket, status: TicketStatus.CANCELLED })
      };
    }

    if (paystackData.amount !== payment.amountKobo || paystackData.currency !== "NGN") {
      throw new BadRequestException("Verified payment amount or currency does not match this event ticket.");
    }

    const now = new Date();
    const eventIsBookable = this.isBookableEvent(ticket.event, now);

    if (!eventIsBookable && !CONFIRMED_TICKET_STATUSES.includes(ticket.status)) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.payment.update({
          where: { providerReference: reference },
          data: {
            status: PaymentStatus.SUCCESS,
            providerMetadata: {
              ...metadata,
              paystack: paystackData,
              refundRequired: true,
              refundReason: "Event is no longer available."
            }
          }
        });

        await transaction.ticket.deleteMany({ where: { id: { in: ticketIds } } });
      });

      return {
        status: PaymentStatus.SUCCESS,
        refundRequired: true,
        message: "Payment received, but this event is no longer available. Refunds are being processed and we will contact you by email.",
        ticket: this.formatTicket({ ...ticket, status: TicketStatus.CANCELLED })
      };
    }

    const reservationWasActive =
      orderedTickets.every((item) => item.status === TicketStatus.RESERVED && item.reservedUntil !== null && item.reservedUntil > now);
    const ticketQuantity = orderedTickets.filter((item) => !CONFIRMED_TICKET_STATUSES.includes(item.status)).length;

    const activation = await this.prisma.$transaction(async (transaction) => {
      await this.lockTicketType(transaction, ticket.ticketTypeId);

      await transaction.payment.update({
        where: { providerReference: reference },
        data: {
          status: PaymentStatus.SUCCESS,
          providerMetadata: {
            ...metadata,
            paystack: paystackData
          }
        }
      });

      const userOwnedTickets = await transaction.ticket.count({
        where: {
          id: { notIn: ticketIds },
          userId: ticket.userId,
          eventId: ticket.eventId,
          status: { in: CONFIRMED_TICKET_STATUSES }
        }
      });

      if (userOwnedTickets + ticketQuantity > ticket.ticketType.maxTicketsPerUser) {
        await transaction.payment.update({
          where: { providerReference: reference },
          data: {
            providerMetadata: {
              ...metadata,
              paystack: paystackData,
              refundRequired: true,
              refundReason: "Ticket purchase limit exceeded."
            }
          }
        });
        await transaction.ticket.deleteMany({ where: { id: { in: ticketIds } } });

        return {
          tickets: [],
          expiredSoldOut: true,
          refundRequired: true,
          message: "Payment received, but this purchase would exceed the ticket limit for this event. Refunds are being processed and we will contact you by email."
        };
      }

      if (!reservationWasActive) {
        const activeTickets = await transaction.ticket.count({
          where: {
            ticketTypeId: ticket.ticketTypeId,
            ...getActiveTicketWhere(now)
          }
        });

        if (activeTickets + ticketQuantity > ticket.ticketType.capacity) {
          await transaction.payment.update({
            where: { providerReference: reference },
            data: {
              providerMetadata: {
                ...metadata,
                paystack: paystackData,
                refundRequired: true,
                refundReason: "Ticket reservation expired or event sold out."
              }
            }
          });
          await transaction.ticket.deleteMany({ where: { id: { in: ticketIds } } });

          return {
            tickets: [],
            expiredSoldOut: true,
            refundRequired: true,
            message: "Payment received, but the reservation expired and this event is now sold out. Refunds are being processed and we will contact you by email."
          };
        }
      }

      await transaction.ticket.updateMany({
        where: { id: { in: ticketIds } },
        data: {
          status: TicketStatus.PAID,
          reservedUntil: null
        }
      });
      const paidTickets = await transaction.ticket.findMany({
        where: { id: { in: ticketIds } },
        include: {
          ticketType: true,
          event: true
        }
      });

      if (ticketQuantity > 0) {
        await transaction.ticketType.update({
          where: { id: ticket.ticketTypeId },
          data: { soldCount: { increment: ticketQuantity } }
        });
      }

      return {
        tickets: ticketIds
          .map((ticketId) => paidTickets.find((item) => item.id === ticketId))
          .filter((item): item is (typeof paidTickets)[number] => Boolean(item)),
        expiredSoldOut: false,
        refundRequired: false
      };
    });

    if (activation.refundRequired) {
      return {
        status: PaymentStatus.SUCCESS,
        refundRequired: true,
        message: activation.message
      };
    }

    if (activation.expiredSoldOut || activation.tickets.length === 0) {
      throw new BadRequestException(
        "Payment succeeded, but the reservation expired and this event is now sold out. Please contact support for a refund."
      );
    }

    return {
      status: PaymentStatus.SUCCESS,
      ticket: this.formatTicket(activation.tickets[0]),
      tickets: activation.tickets.map((item) => this.formatTicket(item))
    };
  }

  private async verifyPaymentReference(reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference },
      select: { purpose: true }
    });

    if (!payment) {
      throw new BadRequestException("Payment record not found.");
    }

    if (payment.purpose === PaymentPurpose.EVENT_TICKET) {
      return this.verifyAndActivateEventTicket(reference);
    }

    return this.verifyAndActivateSubscription(reference);
  }

  private runReservationCleanup() {
    void this.cleanupExpiredTicketReservations().catch((error) => {
      this.logger.warn(`Unable to clean up expired ticket reservations: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }

  private cleanupExpiredTicketReservations(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    now = new Date()
  ) {
    return client.ticket.deleteMany({
      where: getExpiredReservationWhere(now, this.getTicketReservationMinutes())
    });
  }

  private getTicketReservationMinutes() {
    const configuredMinutes = this.config.get<string>("EVENT_TICKET_RESERVATION_MINUTES");
    const minutes = Number.parseInt(configuredMinutes ?? "", 10);

    if (!Number.isFinite(minutes) || minutes < 1) {
      return DEFAULT_TICKET_RESERVATION_MINUTES;
    }

    return Math.min(120, minutes);
  }

  private async callPaystack<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`https://api.paystack.co${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>("PAYSTACK_SECRET_KEY")}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    const data = (await response.json()) as T;

    if (!response.ok) {
      throw new BadRequestException((data as { message?: string }).message ?? "Paystack request failed.");
    }

    return data;
  }

  private async ensureActiveTicketBuyer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("User not found.");
    }

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException("Admins manage events but cannot buy tickets.");
    }

    const accountBlock = getAccountAccessBlock(user);

    if (accountBlock) {
      throw new ForbiddenException(accountBlock);
    }

    if (
      user.subscriptionStatus !== SubscriptionStatus.ACTIVE ||
      !user.subscriptionEndsAt ||
      user.subscriptionEndsAt <= new Date()
    ) {
      throw new ForbiddenException("Active crushclub membership required.");
    }

    return user;
  }

  private getProviderMetadata(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private getRequestedTicketType<T extends { id: string; name: string }>(ticketTypes: T[], ticketTypeId: string | undefined) {
    const sortedTicketTypes = this.sortTicketTypes(ticketTypes);

    if (ticketTypeId) {
      const ticketType = sortedTicketTypes.find((item) => item.id === ticketTypeId);

      if (!ticketType) {
        throw new BadRequestException("Ticket tier is not available for this event.");
      }

      return ticketType;
    }

    if (sortedTicketTypes.length > 1) {
      throw new BadRequestException("Choose a ticket tier.");
    }

    const ticketType = sortedTicketTypes[0];

    if (!ticketType) {
      throw new BadRequestException("Event ticket type is missing.");
    }

    return ticketType;
  }

  private sortTicketTypes<T extends { name: string }>(ticketTypes: T[]) {
    return [...ticketTypes].sort((a, b) => this.getTicketTierOrder(a.name) - this.getTicketTierOrder(b.name));
  }

  private getTicketTierOrder(name: string) {
    const normalizedName = this.normalizeTicketTypeName(name);

    return EVENT_TICKET_TIER_NAMES.indexOf(normalizedName);
  }

  private normalizeTicketTypeName(name: string): (typeof EVENT_TICKET_TIER_NAMES)[number] {
    const normalized = name.trim();

    if (normalized === "General Admission") {
      return REGULAR_TICKET_NAME;
    }

    if ((EVENT_TICKET_TIER_NAMES as readonly string[]).includes(normalized)) {
      return normalized as (typeof EVENT_TICKET_TIER_NAMES)[number];
    }

    return REGULAR_TICKET_NAME;
  }

  private formatTicket(ticket: {
    id: string;
    code: string;
    status: TicketStatus;
    createdAt: Date;
    event: { id: string; title: string; startsAt: Date };
    ticketType: { id: string; name: string; priceKobo: number };
  }) {
    return {
      id: ticket.id,
      code: ticket.code,
      status: ticket.status,
      createdAt: ticket.createdAt,
      event: {
        id: ticket.event.id,
        title: ticket.event.title,
        startsAt: ticket.event.startsAt
      },
      ticketType: {
        id: ticket.ticketType.id,
        name: this.normalizeTicketTypeName(ticket.ticketType.name),
        priceKobo: ticket.ticketType.priceKobo
      }
    };
  }

  private createReference(prefix = "STZSUB") {
    return `${prefix}-${Date.now()}-${randomBytes(6).toString("hex")}`;
  }

  private createTicketCode() {
    return `STZTIX-${randomBytes(5).toString("hex").toUpperCase()}`;
  }

  private getTicketQuantity(quantity: number | undefined) {
    if (quantity === undefined) {
      return 1;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new BadRequestException("Ticket quantity must be between 1 and 20.");
    }

    return quantity;
  }

  private assertTicketPurchaseAvailability({
    quantity,
    activeTickets,
    capacity,
    userOwnedTickets,
    maxTicketsPerUser
  }: {
    quantity: number;
    activeTickets: number;
    capacity: number;
    userOwnedTickets: number;
    maxTicketsPerUser: number;
  }) {
    if (activeTickets + quantity > capacity) {
      throw new BadRequestException(quantity === 1 ? "This event is sold out." : "Not enough tickets are available.");
    }

    if (userOwnedTickets + quantity > maxTicketsPerUser) {
      const remaining = Math.max(0, maxTicketsPerUser - userOwnedTickets);

      throw new BadRequestException(
        remaining === 0
          ? `You already own the maximum of ${maxTicketsPerUser} ticket${maxTicketsPerUser === 1 ? "" : "s"} for this event.`
          : `You can only buy ${remaining} more ticket${remaining === 1 ? "" : "s"} for this event.`
      );
    }
  }

  private async lockTicketType(client: Prisma.TransactionClient, ticketTypeId: string) {
    await client.$queryRaw`SELECT id FROM "TicketType" WHERE id = ${ticketTypeId} FOR UPDATE`;
  }

  private getBookableEventWhere(now: Date): Prisma.EventWhereInput {
    return {
      status: EventStatus.PUBLISHED,
      OR: [
        { endsAt: { gt: now } },
        {
          endsAt: null,
          startsAt: { gt: now }
        }
      ]
    };
  }

  private isBookableEvent(event: { status: EventStatus; startsAt: Date; endsAt: Date | null }, now: Date) {
    if (event.status !== EventStatus.PUBLISHED) {
      return false;
    }

    if (event.endsAt) {
      return event.endsAt > now;
    }

    return event.startsAt > now;
  }

  private isValidSignature(signature: string, rawBody: Buffer) {
    const secret = this.config.getOrThrow<string>("PAYSTACK_SECRET_KEY");
    const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
    const signatureBuffer = Buffer.from(signature, "hex");
    const hashBuffer = Buffer.from(hash, "hex");

    return signatureBuffer.length === hashBuffer.length && timingSafeEqual(signatureBuffer, hashBuffer);
  }

  private mapPaystackStatus(status: string) {
    if (status === "failed") {
      return PaymentStatus.FAILED;
    }

    if (status === "abandoned") {
      return PaymentStatus.ABANDONED;
    }

    if (status === "reversed") {
      return PaymentStatus.REVERSED;
    }

    return PaymentStatus.PENDING;
  }
}
