import { Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus, TicketStatus } from "@prisma/client";
import { GuestTicketsService } from "../events/guest-tickets.service";
import { CONFIRMED_TICKET_STATUSES } from "../events/ticket-reservations";
import { PrismaService } from "../prisma/prisma.service";
import { renderTicketPdf } from "./ticket-pdf";
import { getTicketVenue } from "../events/event-venue";

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
      venue: getTicketVenue(first.event, new Date(), { confirmed: tickets.some((ticket) => CONFIRMED_TICKET_STATUSES.includes(ticket.status)) }),
      eventCancelled: first.event.status === EventStatus.CANCELLED,
      displayName: first.user.displayName,
      tickets: tickets.map((ticket) => ({ code: ticket.code, tier: ticket.ticketType.name, status: ticket.status }))
    });
  }

  async downloadGuestTickets(orderId: string, token?: string) {
    const booking = await this.guestTickets.getManagedBookingSource(orderId, token);
    const tickets = booking.tickets.filter((ticket) => [...CONFIRMED_TICKET_STATUSES, TicketStatus.CANCELLED].includes(ticket.status));
    if (!tickets.length) throw new NotFoundException("No confirmed tickets found for this event.");
    return renderTicketPdf({
      eventTitle: booking.event.title, startsAt: booking.event.startsAt,
      venue: getTicketVenue(booking.event, new Date(), { confirmed: tickets.some((ticket) => CONFIRMED_TICKET_STATUSES.includes(ticket.status)) }),
      eventCancelled: booking.event.status === EventStatus.CANCELLED,
      displayName: booking.displayName,
      tickets: tickets.map((ticket) => ({ code: ticket.code, tier: booking.ticketType.name, status: ticket.status }))
    });
  }
}
