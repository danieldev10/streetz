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

export async function getCheckedInStandardEventCounts(client: AttendanceClient, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const counts = new Map(uniqueUserIds.map((userId) => [userId, 0]));

  if (uniqueUserIds.length === 0) {
    return counts;
  }

  const attendedEvents = await client.ticket.findMany({
    where: {
      userId: { in: uniqueUserIds },
      status: TicketStatus.CHECKED_IN,
      checkedInAt: { not: null },
      event: { kind: EventKind.STANDARD }
    },
    distinct: ["userId", "eventId"],
    select: { userId: true, eventId: true }
  });

  for (const attendance of attendedEvents) {
    if (!attendance.userId) {
      continue;
    }

    counts.set(attendance.userId, (counts.get(attendance.userId) ?? 0) + 1);
  }

  return counts;
}
