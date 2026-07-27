import { MatchStatus, Prisma } from "@prisma/client";

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
  const rows = await client.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "RoomMembership" AS membership
    INNER JOIN "ChatRoom" AS room
      ON room."id" = membership."roomId"
    INNER JOIN "ChatMessage" AS message
      ON message."roomId" = membership."roomId"
    WHERE membership."userId" = ${userId}
      AND room."isActive" = true
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
  const rows = await client.$queryRaw<GroupedCountRow[]>`
    SELECT membership."roomId" AS "conversationId", COUNT(*)::bigint AS "count"
    FROM "RoomMembership" AS membership
    INNER JOIN "ChatRoom" AS room
      ON room."id" = membership."roomId"
    INNER JOIN "ChatMessage" AS message
      ON message."roomId" = membership."roomId"
    WHERE membership."userId" = ${userId}
      AND room."isActive" = true
      AND message."authorId" <> ${userId}
      AND message."deletedAt" IS NULL
      AND message."createdAt" > membership."lastReadAt"
    GROUP BY membership."roomId"
  `;

  return readGroupedCounts(rows);
}
