import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventStatus } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { CONFIRMED_TICKET_STATUSES } from "../events/ticket-reservations";
import { JobError } from "../jobs/job-errors";

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
    const sent = await this.mail.sendTicketConfirmationEmail({
      to: holder.email, displayName: holder.displayName, eventTitle: first.event.title, messageId,
      venue: [first.event.venue, first.event.city, first.event.state].filter(Boolean).join(", "),
      startsAt: first.event.startsAt,
      tickets: tickets.map((ticket) => ({ code: ticket.code, tier: ticket.ticketType.name, status: ticket.status })),
      manageUrl: first.user ? `${webUrl}/events/${first.eventId}` : manageUrl
    });
    if (!sent) throw new JobError("SMTP_NOT_CONFIGURED");
  }
}
