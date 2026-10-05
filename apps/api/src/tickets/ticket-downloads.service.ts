import { Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus, TicketStatus } from "@prisma/client";
import { GuestTicketsService } from "../events/guest-tickets.service";
import { CONFIRMED_TICKET_STATUSES } from "../events/ticket-reservations";
import { PrismaService } from "../prisma/prisma.service";
import { renderTicketPdf } from "./ticket-pdf";

@Injectable()
export class TicketDownloadsService {
  constructor(private readonly prisma: PrismaService, private readonly guestTickets: GuestTicketsService) {}

  async downloadMemberTickets(userId: string, eventId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { userId, eventId, status: { in: [...CONFIRMED_TICKET_STATUSES, TicketStatus.CANCELLED] } },
      include: { event: true, ticketType: true, user: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" }
    });
    const first = tickets[0];
    if (!first?.user) throw new NotFoundException("No confirmed tickets found for this event.");
    return renderTicketPdf({
      eventTitle: first.event.title, startsAt: first.event.startsAt,
      venue: [first.event.venue, first.event.city, first.event.state].filter(Boolean).join(", "),
      eventCancelled: first.event.status === EventStatus.CANCELLED,
      displayName: first.user.displayName,
      tickets: tickets.map((ticket) => ({ code: ticket.code, tier: ticket.ticketType.name, status: ticket.status }))
    });
  }

  async downloadGuestTickets(orderId: string, token?: string) {
    const booking = await this.guestTickets.getManagedBooking(orderId, token);
    return renderTicketPdf({
      eventTitle: booking.event.title, startsAt: booking.event.startsAt,
      venue: [booking.event.venue, booking.event.city, booking.event.state].filter(Boolean).join(", "),
      eventCancelled: booking.event.status === EventStatus.CANCELLED,
      displayName: booking.displayName,
      tickets: booking.tickets.map((ticket) => ({ code: ticket.code, tier: booking.ticketType.name, status: ticket.status }))
    });
  }
}
