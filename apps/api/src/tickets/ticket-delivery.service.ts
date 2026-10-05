import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventStatus, TicketEmailDelivery } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { CONFIRMED_TICKET_STATUSES } from "../events/ticket-reservations";

@Injectable()
export class TicketDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService,
    private readonly config: ConfigService) {}

  onModuleInit() {
    void this.runPendingDeliveries();
    this.timer = setInterval(() => void this.runPendingDeliveries(), 15_000);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async runPendingDeliveries() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const jobs = await this.prisma.ticketEmailDelivery.findMany({
        where: { sentAt: null, nextAttemptAt: { lte: now },
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
        orderBy: { createdAt: "asc" }, take: 20
      });
      for (const job of jobs) await this.deliver(job);
    } catch {
      this.logger.error("Could not process ticket emails; the next worker pass will retry.");
    } finally { this.running = false; }
  }

  private async deliver(job: TicketEmailDelivery) {
    const now = new Date();
    // A database lease prevents two API replicas sending the same job concurrently.
    const claimed = await this.prisma.ticketEmailDelivery.updateMany({
      where: { id: job.id, sentAt: null, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { lockedUntil: new Date(now.getTime() + 120_000), attempts: { increment: 1 } }
    });
    if (!claimed.count) return;

    try {
      const tickets = await this.prisma.ticket.findMany({
        where: { id: { in: job.ticketIds }, status: { in: CONFIRMED_TICKET_STATUSES },
          event: { status: { not: EventStatus.CANCELLED } } },
        include: { event: true, ticketType: true, user: { select: { id: true, email: true, displayName: true } }, guestOrder: true },
        orderBy: { createdAt: "asc" }
      });
      const first = tickets[0];
      if (first) {
        const holder = first.user ?? first.guestOrder;
        if (!holder || tickets.some((ticket) => ticket.eventId !== first.eventId ||
          ticket.userId !== first.userId || ticket.guestOrderId !== first.guestOrderId)) {
          throw new Error("Invalid ticket email batch");
        }
        const webUrl = this.config.getOrThrow<string>("WEB_APP_URL").replace(/\/+$/, "");
        const sent = await this.mail.sendTicketConfirmationEmail({
          to: holder.email, displayName: holder.displayName, eventTitle: first.event.title,
          venue: [first.event.venue, first.event.city, first.event.state].filter(Boolean).join(", "),
          startsAt: first.event.startsAt,
          tickets: tickets.map((ticket) => ({ code: ticket.code, tier: ticket.ticketType.name, status: ticket.status })),
          manageUrl: first.user ? `${webUrl}/events/${first.eventId}` : undefined
        });
        if (!sent) throw new Error("Ticket email was not sent");
      }
      // Deleted/refunded/cancelled tickets must never be emailed as valid admission.
      await this.prisma.ticketEmailDelivery.update({ where: { id: job.id }, data: { sentAt: new Date(), lockedUntil: null } });
    } catch {
      const delay = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(job.attempts, 6));
      await this.prisma.ticketEmailDelivery.update({ where: { id: job.id },
        data: { lockedUntil: null, nextAttemptAt: new Date(Date.now() + delay) } });
      this.logger.warn(`Ticket email delivery ${job.id} failed and will be retried.`);
    }
  }
}
