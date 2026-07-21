import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventKind, EventStatus, Prisma, TicketStatus } from "@prisma/client";
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConfirmGuestTicketDto } from "./dto/confirm-guest-ticket.dto";
import { RequestGuestTicketDto } from "./dto/request-guest-ticket.dto";
import { assertGuestTicketAvailability, normalizeGuestEmail } from "./guest-ticket-logic";
import { CONFIRMED_TICKET_STATUSES, getActiveTicketWhere } from "./ticket-reservations";

const VERIFICATION_MINUTES = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;

@Injectable()
export class GuestTicketsService {
  private readonly logger = new Logger(GuestTicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  async requestVerification(eventId: string, dto: RequestGuestTicketDto) {
    const email = normalizeGuestEmail(dto.email);
    const displayName = dto.displayName.trim();
    const event = await this.findPublicFreeEvent(eventId, dto.ticketTypeId);
    const ticketType = event.ticketTypes[0];

    await this.assertCurrentAvailability(ticketType, event.id, email, dto.quantity);

    const requestId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + VERIFICATION_MINUTES * 60_000);

    await this.prisma.$transaction([
      this.prisma.guestTicketRequest.deleteMany({
        where: {
          eventId: event.id,
          ticketTypeId: ticketType.id,
          email,
          consumedAt: null
        }
      }),
      this.prisma.guestTicketRequest.create({
        data: {
          id: requestId,
          eventId: event.id,
          ticketTypeId: ticketType.id,
          email,
          displayName,
          quantity: dto.quantity,
          codeHash: this.hashVerificationCode(requestId, code),
          expiresAt
        }
      })
    ]);

    let emailSent = false;

    try {
      emailSent = await this.mail.sendGuestTicketVerificationEmail({
        to: email,
        displayName,
        eventTitle: event.title,
        code,
        expiresInMinutes: VERIFICATION_MINUTES
      });
    } catch (error) {
      this.logger.error(`Guest ticket verification email failed for request ${requestId}: ${this.errorMessage(error)}`);
    }

    if (!emailSent && process.env.NODE_ENV === "production") {
      await this.prisma.guestTicketRequest.deleteMany({ where: { id: requestId, consumedAt: null } });
      throw new ServiceUnavailableException("We could not send the verification email. Please try again shortly.");
    }

    return {
      requestId,
      email,
      expiresInMinutes: VERIFICATION_MINUTES,
      ...(process.env.NODE_ENV !== "production" ? { verificationCode: code } : {})
    };
  }

  async confirmBooking(eventId: string, dto: ConfirmGuestTicketDto) {
    const initialRequest = await this.prisma.guestTicketRequest.findUnique({
      where: { id: dto.requestId }
    });

    if (!initialRequest || initialRequest.eventId !== eventId) {
      throw this.invalidCodeError();
    }

    if (!this.isRequestUsable(initialRequest) || !this.matchesVerificationCode(initialRequest.id, dto.code, initialRequest.codeHash)) {
      if (!initialRequest.consumedAt && initialRequest.expiresAt > new Date() && initialRequest.attempts < MAX_VERIFICATION_ATTEMPTS) {
        await this.prisma.guestTicketRequest.update({
          where: { id: initialRequest.id },
          data: { attempts: { increment: 1 } }
        });
      }
      throw this.invalidCodeError();
    }

    const manageToken = randomBytes(48).toString("base64url");
    const now = new Date();
    const booking = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "TicketType" WHERE id = ${initialRequest.ticketTypeId} FOR UPDATE`;

      const request = await transaction.guestTicketRequest.findUnique({
        where: { id: initialRequest.id },
        include: {
          event: true,
          ticketType: true
        }
      });

      if (
        !request ||
        request.eventId !== eventId ||
        !this.isRequestUsable(request, now) ||
        !this.matchesVerificationCode(request.id, dto.code, request.codeHash)
      ) {
        throw this.invalidCodeError();
      }

      this.assertGuestBookableEvent(request.event, request.ticketType.priceKobo, now);
      const [activeTickets, guestOwnedTickets] = await Promise.all([
        transaction.ticket.count({
          where: {
            ticketTypeId: request.ticketTypeId,
            ...getActiveTicketWhere(now)
          }
        }),
        transaction.ticket.count({
          where: {
            eventId: request.eventId,
            ticketTypeId: request.ticketTypeId,
            status: { in: CONFIRMED_TICKET_STATUSES },
            guestOrder: { email: request.email }
          }
        })
      ]);

      assertGuestTicketAvailability({
        quantity: request.quantity,
        activeTickets,
        capacity: request.ticketType.capacity,
        guestOwnedTickets,
        maxTicketsPerGuest: request.ticketType.maxTicketsPerUser
      });

      const consumed = await transaction.guestTicketRequest.updateMany({
        where: {
          id: request.id,
          consumedAt: null,
          attempts: { lt: MAX_VERIFICATION_ATTEMPTS },
          expiresAt: { gt: now }
        },
        data: { consumedAt: now }
      });

      if (consumed.count !== 1) {
        throw this.invalidCodeError();
      }

      const order = await transaction.guestTicketOrder.create({
        data: {
          eventId: request.eventId,
          ticketTypeId: request.ticketTypeId,
          email: request.email,
          displayName: request.displayName,
          manageTokenHash: this.hashManageToken(manageToken),
          tickets: {
            create: Array.from({ length: request.quantity }, () => ({
              eventId: request.eventId,
              ticketTypeId: request.ticketTypeId,
              code: this.createTicketCode(),
              status: TicketStatus.CONFIRMED
            }))
          }
        },
        include: {
          event: true,
          ticketType: true,
          tickets: { orderBy: { createdAt: "asc" } }
        }
      });

      await transaction.ticketType.update({
        where: { id: request.ticketTypeId },
        data: { soldCount: { increment: request.quantity } }
      });

      return order;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    let emailSent = false;
    try {
      emailSent = await this.mail.sendGuestTicketConfirmationEmail({
        to: booking.email,
        displayName: booking.displayName,
        eventTitle: booking.event.title,
        venue: [booking.event.venue, booking.event.city, booking.event.state].filter(Boolean).join(", "),
        startsAt: booking.event.startsAt,
        ticketTier: booking.ticketType.name,
        ticketCodes: booking.tickets.map((ticket) => ticket.code)
      });
    } catch (error) {
      this.logger.error(`Guest ticket confirmation email failed for order ${booking.id}: ${this.errorMessage(error)}`);
    }

    return {
      orderId: booking.id,
      email: booking.email,
      displayName: booking.displayName,
      manageToken,
      emailSent,
      event: {
        id: booking.event.id,
        title: booking.event.title,
        venue: booking.event.venue,
        state: booking.event.state,
        city: booking.event.city,
        startsAt: booking.event.startsAt,
        endsAt: booking.event.endsAt
      },
      ticketType: {
        id: booking.ticketType.id,
        name: booking.ticketType.name,
        priceKobo: booking.ticketType.priceKobo
      },
      tickets: booking.tickets.map((ticket) => ({
        id: ticket.id,
        code: ticket.code,
        status: ticket.status,
        createdAt: ticket.createdAt
      }))
    };
  }

  private async findPublicFreeEvent(eventId: string, ticketTypeId: string) {
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        kind: EventKind.STANDARD,
        status: EventStatus.PUBLISHED,
        OR: [
          { endsAt: { gt: now } },
          { endsAt: null, startsAt: { gt: now } }
        ]
      },
      include: {
        ticketTypes: { where: { id: ticketTypeId } }
      }
    });

    if (!event || event.ticketTypes.length !== 1) {
      throw new NotFoundException("This event is not available for guest booking.");
    }

    if (event.ticketTypes[0].priceKobo > 0) {
      throw new BadRequestException("Guest booking is only available for free tickets.");
    }

    return event;
  }

  private async assertCurrentAvailability(
    ticketType: { id: string; capacity: number; maxTicketsPerUser: number },
    eventId: string,
    email: string,
    quantity: number
  ) {
    const [activeTickets, guestOwnedTickets] = await Promise.all([
      this.prisma.ticket.count({ where: { ticketTypeId: ticketType.id, ...getActiveTicketWhere(new Date()) } }),
      this.prisma.ticket.count({
        where: {
          eventId,
          ticketTypeId: ticketType.id,
          status: { in: CONFIRMED_TICKET_STATUSES },
          guestOrder: { email }
        }
      })
    ]);

    assertGuestTicketAvailability({
      quantity,
      activeTickets,
      capacity: ticketType.capacity,
      guestOwnedTickets,
      maxTicketsPerGuest: ticketType.maxTicketsPerUser
    });
  }

  private assertGuestBookableEvent(
    event: { kind: EventKind; status: EventStatus; startsAt: Date; endsAt: Date | null },
    priceKobo: number,
    now: Date
  ) {
    const endTime = event.endsAt ?? event.startsAt;
    if (
      event.kind !== EventKind.STANDARD ||
      event.status !== EventStatus.PUBLISHED ||
      endTime <= now ||
      priceKobo > 0
    ) {
      throw new BadRequestException("This event is no longer available for guest booking.");
    }
  }

  private isRequestUsable(request: { attempts: number; consumedAt: Date | null; expiresAt: Date }, now = new Date()) {
    return request.consumedAt === null && request.attempts < MAX_VERIFICATION_ATTEMPTS && request.expiresAt > now;
  }

  private hashVerificationCode(requestId: string, code: string) {
    return createHmac("sha256", this.getSecret()).update(`${requestId}:${code}`).digest("hex");
  }

  private matchesVerificationCode(requestId: string, code: string, storedHash: string) {
    const expected = Buffer.from(storedHash, "hex");
    const actual = Buffer.from(this.hashVerificationCode(requestId, code), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private hashManageToken(token: string) {
    return createHmac("sha256", this.getSecret()).update(`manage:${token}`).digest("hex");
  }

  private getSecret() {
    return this.config.get<string>("GUEST_TICKET_SECRET") ??
      this.config.get<string>("JWT_REFRESH_SECRET") ??
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
  }

  private createTicketCode() {
    return `STZTIX-${randomBytes(5).toString("hex").toUpperCase()}`;
  }

  private invalidCodeError() {
    return new BadRequestException("The verification code is invalid or expired.");
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
