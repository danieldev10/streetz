import { EventStatus, MatchStatus, Prisma, TicketStatus } from "@prisma/client";
import { EVENT_ROOM_GRACE_PERIOD_MS } from "../rooms/event-room-lifecycle";

type UnreadCountClient = Pick<Prisma.TransactionClient, "$queryRaw">;

type CountRow = {
  count: bigint;
};

type GroupedCountRow = CountRow & {
  conversationId: string;
};

function readCount(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

function readGroupedCounts(rows: GroupedCountRow[]) {
  return new Map(rows.map((row) => [row.conversationId, Number(row.count)]));
}

export async function countUnreadDirectMessages(client: UnreadCountClient, userId: string) {
  const rows = await client.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "DirectMessage" AS message
    INNER JOIN "Match" AS match
      ON match."id" = message."matchId"
    LEFT JOIN "MatchReadState" AS read_state
      ON read_state."matchId" = match."id"
      AND read_state."userId" = ${userId}
    WHERE match."status" = ${MatchStatus.ACTIVE}::"MatchStatus"
      AND (match."userAId" = ${userId} OR match."userBId" = ${userId})
      AND message."senderId" <> ${userId}
      AND (
        read_state."lastReadAt" IS NULL
        OR message."createdAt" > read_state."lastReadAt"
      )
  `;

  return readCount(rows);
}

export async function countUnreadRoomMessages(client: UnreadCountClient, userId: string) {
  const eventCutoff = new Date(Date.now() - EVENT_ROOM_GRACE_PERIOD_MS);
  const rows = await client.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "RoomMembership" AS membership
    INNER JOIN "ChatRoom" AS room
      ON room."id" = membership."roomId"
    INNER JOIN "Event" AS event
      ON event."id" = room."eventId"
    INNER JOIN "ChatMessage" AS message
      ON message."roomId" = membership."roomId"
    WHERE membership."userId" = ${userId}
      AND room."isActive" = true
      AND event."status" IN (${EventStatus.PUBLISHED}::"EventStatus", ${EventStatus.COMPLETED}::"EventStatus")
      AND COALESCE(event."endsAt", event."startsAt") > ${eventCutoff}
      AND EXISTS (
        SELECT 1
        FROM "Ticket" AS ticket
        WHERE ticket."eventId" = event."id"
          AND ticket."userId" = ${userId}
          AND ticket."status" IN (
            ${TicketStatus.CONFIRMED}::"TicketStatus",
            ${TicketStatus.PAID}::"TicketStatus",
            ${TicketStatus.CHECKED_IN}::"TicketStatus"
          )
      )
      AND message."authorId" <> ${userId}
      AND message."deletedAt" IS NULL
      AND message."createdAt" > membership."lastReadAt"
  `;

  return readCount(rows);
}

export async function getUnreadDirectMessageCountsByMatch(client: UnreadCountClient, userId: string) {
  const rows = await client.$queryRaw<GroupedCountRow[]>`
    SELECT match."id" AS "conversationId", COUNT(*)::bigint AS "count"
    FROM "DirectMessage" AS message
    INNER JOIN "Match" AS match
      ON match."id" = message."matchId"
    LEFT JOIN "MatchReadState" AS read_state
      ON read_state."matchId" = match."id"
      AND read_state."userId" = ${userId}
    WHERE match."status" = ${MatchStatus.ACTIVE}::"MatchStatus"
      AND (match."userAId" = ${userId} OR match."userBId" = ${userId})
      AND message."senderId" <> ${userId}
      AND (
        read_state."lastReadAt" IS NULL
        OR message."createdAt" > read_state."lastReadAt"
      )
    GROUP BY match."id"
  `;

  return readGroupedCounts(rows);
}

export async function getUnreadRoomMessageCountsByRoom(client: UnreadCountClient, userId: string) {
  const eventCutoff = new Date(Date.now() - EVENT_ROOM_GRACE_PERIOD_MS);
  const rows = await client.$queryRaw<GroupedCountRow[]>`
    SELECT membership."roomId" AS "conversationId", COUNT(*)::bigint AS "count"
    FROM "RoomMembership" AS membership
    INNER JOIN "ChatRoom" AS room
      ON room."id" = membership."roomId"
    INNER JOIN "Event" AS event
      ON event."id" = room."eventId"
    INNER JOIN "ChatMessage" AS message
      ON message."roomId" = membership."roomId"
    WHERE membership."userId" = ${userId}
      AND room."isActive" = true
      AND event."status" IN (${EventStatus.PUBLISHED}::"EventStatus", ${EventStatus.COMPLETED}::"EventStatus")
      AND COALESCE(event."endsAt", event."startsAt") > ${eventCutoff}
      AND EXISTS (
        SELECT 1
        FROM "Ticket" AS ticket
        WHERE ticket."eventId" = event."id"
          AND ticket."userId" = ${userId}
          AND ticket."status" IN (
            ${TicketStatus.CONFIRMED}::"TicketStatus",
            ${TicketStatus.PAID}::"TicketStatus",
            ${TicketStatus.CHECKED_IN}::"TicketStatus"
          )
      )
      AND message."authorId" <> ${userId}
      AND message."deletedAt" IS NULL
      AND message."createdAt" > membership."lastReadAt"
    GROUP BY membership."roomId"
  `;

  return readGroupedCounts(rows);
}
