import { Prisma, TicketStatus } from "@prisma/client";

export const DEFAULT_TICKET_RESERVATION_MINUTES = 15;
export const CONFIRMED_TICKET_STATUSES: TicketStatus[] = [TicketStatus.PAID, TicketStatus.CHECKED_IN];

export function getReservationExpiry(now = new Date(), minutes = DEFAULT_TICKET_RESERVATION_MINUTES) {
  return new Date(now.getTime() + minutes * 60_000);
}

export function getActiveTicketWhere(now = new Date()): Prisma.TicketWhereInput {
  return {
    OR: [
      { status: { in: CONFIRMED_TICKET_STATUSES } },
      {
        status: TicketStatus.RESERVED,
        reservedUntil: { gt: now }
      }
    ]
  };
}

export function getExpiredReservationWhere(
  now = new Date(),
  fallbackMinutes = DEFAULT_TICKET_RESERVATION_MINUTES
): Prisma.TicketWhereInput {
  const fallbackCreatedBefore = new Date(now.getTime() - fallbackMinutes * 60_000);

  return {
    status: TicketStatus.RESERVED,
    OR: [
      { reservedUntil: { lte: now } },
      {
        reservedUntil: null,
        createdAt: { lte: fallbackCreatedBefore }
      }
    ]
  };
}
