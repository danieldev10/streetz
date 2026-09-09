export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
export type TicketStatus =
  | "RESERVED"
  | "CONFIRMED"
  | "PAID"
  | "CHECKED_IN"
  | "CANCELLED"
  | "REFUNDED";
export type EventBookingAccess = "MEMBERS_ONLY" | "PUBLIC";
export type StreetzEventTicketType = {
  id: string;
  name: string;
  priceKobo: number;
  capacity: number;
  maxTicketsPerUser: number;
  soldCount: number;
  reservedCount: number;
  availableCount: number;
};

export type StreetzEventTicket = {
  id: string;
  code: string;
  status: TicketStatus;
  checkedInAt: string | null;
  ticketType: {
    id: string;
    name: string;
    priceKobo: number;
  } | null;
  createdAt: string;
};

export type StreetzEvent = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  category: string;
  venue: string;
  state: string | null;
  city: string;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
  bookingAccess: EventBookingAccess;
  cancellationReason: string | null;
  cancelledAt: string | null;
  ticketType: StreetzEventTicketType | null;
  ticketTypes: StreetzEventTicketType[];
  attendeeCount?: number;
  reservationCount?: number;
  totalPaidAmountKobo?: number;
  userTicket?: StreetzEventTicket | null;
  userTickets?: StreetzEventTicket[];
  createdAt: string;
  updatedAt: string;
};
