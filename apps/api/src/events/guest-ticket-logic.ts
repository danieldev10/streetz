import { BadRequestException } from "@nestjs/common";

export function normalizeGuestEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertGuestTicketAvailability(input: {
  quantity: number;
  activeTickets: number;
  capacity: number;
  guestOwnedTickets: number;
  maxTicketsPerGuest: number;
}) {
  if (input.activeTickets + input.quantity > input.capacity) {
    throw new BadRequestException(
      input.quantity === 1 ? "This event is sold out." : "Not enough tickets are available."
    );
  }

  if (input.guestOwnedTickets + input.quantity > input.maxTicketsPerGuest) {
    const remaining = Math.max(0, input.maxTicketsPerGuest - input.guestOwnedTickets);
    throw new BadRequestException(
      remaining === 0
        ? `This email already has the maximum of ${input.maxTicketsPerGuest} ticket${input.maxTicketsPerGuest === 1 ? "" : "s"} for this ticket tier.`
        : `This email can only book ${remaining} more ticket${remaining === 1 ? "" : "s"} for this ticket tier.`
    );
  }
}
