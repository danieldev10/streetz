import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventStatus, PaymentPurpose, PaymentStatus, SubscriptionStatus, TicketStatus, UserRole } from "@prisma/client";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

const SUBSCRIPTION_AMOUNT_KOBO = 100_000;
const SUBSCRIPTION_DAYS = 30;
const ACTIVE_TICKET_STATUSES = [TicketStatus.RESERVED, TicketStatus.PAID, TicketStatus.CHECKED_IN];

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
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async initializeSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("User not found.");
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

  async initializeEventTicket(userId: string, eventId: string) {
    const user = await this.ensureActiveTicketBuyer(userId);
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: EventStatus.PUBLISHED
      },
      include: {
        ticketTypes: {
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });

    if (!event) {
      throw new BadRequestException("Event is not available.");
    }

    const ticketType = event.ticketTypes[0];

    if (!ticketType) {
      throw new BadRequestException("Event ticket type is missing.");
    }

    if (ticketType.priceKobo <= 0) {
      throw new BadRequestException("This event is free. Book it from the event page.");
    }

    const confirmedTicket = await this.prisma.ticket.findFirst({
      where: {
        userId,
        eventId,
        status: { in: [TicketStatus.PAID, TicketStatus.CHECKED_IN] }
      },
      select: {
        id: true,
        code: true,
        status: true
      }
    });

    if (confirmedTicket) {
      return {
        alreadyBooked: true,
        ticket: confirmedTicket
      };
    }

    const ticket = await this.prisma.$transaction(async (transaction) => {
      await transaction.ticket.updateMany({
        where: {
          userId,
          eventId,
          status: TicketStatus.RESERVED
        },
        data: {
          status: TicketStatus.CANCELLED
        }
      });

      const activeTickets = await transaction.ticket.count({
        where: {
          ticketTypeId: ticketType.id,
          status: { in: ACTIVE_TICKET_STATUSES }
        }
      });

      if (activeTickets >= ticketType.capacity) {
        throw new BadRequestException("This event is sold out.");
      }

      return transaction.ticket.create({
        data: {
          eventId,
          userId,
          ticketTypeId: ticketType.id,
          code: this.createTicketCode(),
          status: TicketStatus.RESERVED
        }
      });
    });

    const reference = this.createReference("STZTIX");
    const callbackUrl = `${this.config.getOrThrow<string>("WEB_APP_URL")}/payment/callback?purpose=event-ticket`;

    try {
      const response = await this.callPaystack<PaystackInitializeResponse>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          amount: ticketType.priceKobo,
          email: user.email,
          currency: "NGN",
          reference,
          callback_url: callbackUrl,
          metadata: {
            userId,
            eventId,
            ticketId: ticket.id,
            ticketTypeId: ticketType.id,
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
          amountKobo: ticketType.priceKobo,
          providerReference: reference,
          providerMetadata: {
            accessCode: response.data.access_code,
            eventId,
            ticketId: ticket.id,
            ticketTypeId: ticketType.id
          }
        }
      });

      return {
        authorizationUrl: response.data.authorization_url,
        accessCode: response.data.access_code,
        reference,
        ticketId: ticket.id
      };
    } catch (error) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.CANCELLED }
      });

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
    const ticketId = typeof metadata.ticketId === "string" ? metadata.ticketId : null;

    if (!ticketId) {
      throw new BadRequestException("Ticket reference is missing from this payment.");
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        ticketType: true,
        event: true
      }
    });

    if (!ticket || ticket.userId !== payment.userId) {
      throw new BadRequestException("Ticket record not found.");
    }

    if (payment.status === PaymentStatus.SUCCESS && ([TicketStatus.PAID, TicketStatus.CHECKED_IN] as TicketStatus[]).includes(ticket.status)) {
      return {
        status: PaymentStatus.SUCCESS,
        ticket: this.formatTicket(ticket)
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
        this.prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            status: TicketStatus.CANCELLED
          }
        })
      ]);

      return {
        status: mappedStatus,
        ticket: this.formatTicket({ ...ticket, status: TicketStatus.CANCELLED })
      };
    }

    if (paystackData.amount !== payment.amountKobo || paystackData.currency !== "NGN") {
      throw new BadRequestException("Verified payment amount or currency does not match this event ticket.");
    }

    const shouldIncrementSoldCount = ticket.status !== TicketStatus.PAID && ticket.status !== TicketStatus.CHECKED_IN;

    const updatedTicket = await this.prisma.$transaction(async (transaction) => {
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

      const paidTicket = await transaction.ticket.update({
        where: { id: ticket.id },
        data: {
          status: TicketStatus.PAID
        },
        include: {
          ticketType: true,
          event: true
        }
      });

      if (shouldIncrementSoldCount) {
        await transaction.ticketType.update({
          where: { id: ticket.ticketTypeId },
          data: { soldCount: { increment: 1 } }
        });
      }

      return paidTicket;
    });

    return {
      status: PaymentStatus.SUCCESS,
      ticket: this.formatTicket(updatedTicket)
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
        name: ticket.ticketType.name,
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
