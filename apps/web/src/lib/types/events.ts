export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
export type TicketStatus =
  | "RESERVED"
  | "CONFIRMED"
  | "PAID"
  | "CHECKED_IN"
  | "CANCELLED"
  | "REFUNDED";
export type EventBookingAccess = "MEMBERS_ONLY" | "PUBLIC";
export type RaffleStatus =
  | "SCHEDULED"
  | "SELLING"
  | "SALES_CLOSED"
  | "DRAWN"
  | "CANCELLED";

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

export type RafflePrize = {
  title: string;
  description: string | null;
  image: string | null;
  category: string | null;
  estimatedValueKobo: number | null;
};

export type RaffleWinner = {
  entryId: string;
  number: number;
  userId: string | null;
  displayName: string | null;
  drawnAt: string | null;
};

export type RaffleDetails = {
  status: RaffleStatus;
  ticketPriceKobo: number;
  salesStartsAt: string;
  salesEndsAt: string;
  drawsAt: string;
  prize: RafflePrize;
  ticketsSold: number;
  yourEntryCount: number;
  winner: RaffleWinner | null;
  participantsCount?: number;
  totalRevenueKobo?: number;
};

export type StreetzRaffle = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  status: EventStatus;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  raffle: RaffleDetails;
};

export type RaffleEntry = {
  id: string;
  number: number;
  createdAt: string;
};

export type MyRaffleEntries = {
  raffleId: string;
  title: string;
  prizeTitle: string;
  drawsAt: string;
  status: RaffleStatus;
  count: number;
  isWinner: boolean;
  winningNumber: number | null;
  entries: RaffleEntry[];
};
