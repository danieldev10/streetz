import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccountStatus, EventStatus, EventType } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { CONFIRMED_TICKET_STATUSES } from "../events/ticket-reservations";
import { JobError } from "../jobs/job-errors";
import { getTicketVenue, getVenueDetailsHash, getVenueRevealAt, isVenueEventActive, queueEventVenueEmails } from "../events/event-venue";

/** Rendering/delivery only. The standalone worker owns leases and retries. */
@Injectable()
export class TicketDeliveryService {
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService,
    private readonly config: ConfigService) {}

  async deliver(ticketIds: string[], messageId: string, manageUrl?: string,
    beforeSend: () => Promise<void> = async () => {}) {
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds }, status: { in: CONFIRMED_TICKET_STATUSES },
        event: { status: { not: EventStatus.CANCELLED } } },
      include: { event: true, ticketType: true, user: { select: { id: true, email: true, displayName: true } }, guestOrder: true },
      orderBy: { createdAt: "asc" }
    });
    const first = tickets[0];
    if (!first) return;
    const holder = first.user ?? first.guestOrder;
    if (!holder || tickets.some((ticket) => ticket.eventId !== first.eventId ||
      ticket.userId !== first.userId || ticket.guestOrderId !== first.guestOrderId)) {
      throw new JobError("INVALID_TICKET_BATCH", true);
    }
    const webUrl = this.config.getOrThrow<string>("WEB_APP_URL").replace(/\/+$/, "");
    await beforeSend();
    if (first.event.eventType === EventType.EXCLUSIVE) {
      await this.prisma.$transaction((transaction) => queueEventVenueEmails(transaction, first.event));
    }
    const sent = await this.mail.sendTicketConfirmationEmail({
      to: holder.email, displayName: holder.displayName, eventTitle: first.event.title, messageId,
      venue: getTicketVenue(first.event, new Date(), { initialEmail: true }),
      startsAt: first.event.startsAt,
      tickets: tickets.map((ticket) => ({ code: ticket.code, tier: ticket.ticketType.name, status: ticket.status })),
      manageUrl: first.user ? `${webUrl}/events/${first.eventId}` : manageUrl
    });
    if (!sent) throw new JobError("SMTP_NOT_CONFIGURED");
  }

  /** Recovers scheduling after restarts and catches purchases whose confirmation email is delayed. */
  async scanVenueEmails() {
    let cursor: string | undefined;
    const now = new Date();
    for (;;) {
      const events = await this.prisma.event.findMany({
        where: { eventType: EventType.EXCLUSIVE, status: EventStatus.PUBLISHED,
          OR: [{ endsAt: { gt: now } }, { endsAt: null, startsAt: { gt: now } }] },
        orderBy: { id: "asc" }, take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      for (const event of events) await this.prisma.$transaction((transaction) => queueEventVenueEmails(transaction, event));
      if (events.length < 100) return;
      cursor = events.at(-1)!.id;
    }
  }

  async deliverVenue(deliveryId: string, messageId: string, beforeSend: () => Promise<void> = async () => {}) {
    const delivery = await this.prisma.eventVenueEmail.findUnique({ where: { id: deliveryId }, include: { event: true } });
    if (!delivery || delivery.sentAt || !isVenueEventActive(delivery.event) ||
        getVenueDetailsHash(delivery.event) !== delivery.detailsHash) return;
    if (delivery.event.eventType === EventType.EXCLUSIVE && new Date() < getVenueRevealAt(delivery.event)) {
      throw new JobError("VENUE_NOT_DUE");
    }
    await beforeSend();
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId: delivery.eventId, status: { in: CONFIRMED_TICKET_STATUSES },
        ...(delivery.userId ? { userId: delivery.userId, user: { accountStatus: { not: AccountStatus.DELETED } } }
          : { guestOrderId: delivery.guestOrderId, userId: null }) },
      include: { ticketType: true, user: { select: { email: true, displayName: true } }, guestOrder: true },
      orderBy: { createdAt: "asc" }
    });
    const holder = tickets[0]?.user ?? tickets[0]?.guestOrder;
    if (!holder) return;
    // Recheck immediately before sending: edits/cancellations invalidate queued details.
    const event = await this.prisma.event.findUnique({ where: { id: delivery.eventId } });
    if (!event || !isVenueEventActive(event) || getVenueDetailsHash(event) !== delivery.detailsHash) return;
    if (event.eventType === EventType.EXCLUSIVE && new Date() < getVenueRevealAt(event)) throw new JobError("VENUE_NOT_DUE");
    const sent = await this.mail.sendEventVenueEmail({
      to: holder.email, displayName: holder.displayName, eventTitle: event.title, messageId,
      venue: getTicketVenue(event), startsAt: event.startsAt,
      tickets: tickets.map((ticket) => ({ code: ticket.code, tier: ticket.ticketType.name, status: ticket.status }))
    });
    if (!sent) throw new JobError("SMTP_NOT_CONFIGURED");
    await this.prisma.eventVenueEmail.updateMany({ where: { id: delivery.id, sentAt: null }, data: { sentAt: new Date() } });
  }
}
