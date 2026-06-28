import { EventKind, TicketStatus, type Prisma } from "@prisma/client";

type AttendanceClient = Pick<Prisma.TransactionClient, "ticket">;

export async function countCheckedInStandardEvents(client: AttendanceClient, userId: string) {
  const attendedEvents = await client.ticket.findMany({
    where: {
      userId,
      status: TicketStatus.CHECKED_IN,
      checkedInAt: { not: null },
      event: { kind: EventKind.STANDARD }
    },
    distinct: ["eventId"],
    select: { eventId: true }
  });

  return attendedEvents.length;
}
