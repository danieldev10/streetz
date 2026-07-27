const assert = require("node:assert/strict");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { MatchStatus, PrismaClient } = require("@prisma/client");
const {
  countUnreadDirectMessages,
  countUnreadRoomMessages,
  getUnreadDirectMessageCountsByMatch,
  getUnreadRoomMessageCountsByRoom,
} = require("../dist/src/notifications/unread-message-counts.js");
const { RoomsGateway } = require("../dist/src/rooms/rooms.gateway.js");
const { getDatabasePoolSettings } = require("../dist/src/prisma/database-pool-settings.js");

const connectionString = process.env.TEST_DATABASE_URL;

function config(values = {}) {
  return {
    get(key) {
      return values[key];
    },
  };
}

test("database pool settings have bounded production-safe defaults", () => {
  assert.deepEqual(getDatabasePoolSettings(config()), {
    maxConnections: 10,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 30_000,
    maxLifetimeSeconds: 1_800,
    statementTimeoutMs: 15_000,
  });
  assert.equal(getDatabasePoolSettings(config({ DB_POOL_MAX: "20" })).maxConnections, 20);
  assert.throws(() => getDatabasePoolSettings(config({ DB_POOL_MAX: "0" })), /DB_POOL_MAX/);
  assert.throws(() => getDatabasePoolSettings(config({ DB_STATEMENT_TIMEOUT_MS: "not-a-number" })), /DB_STATEMENT_TIMEOUT_MS/);
});

test("room message notifications batch recipients and never notify the author", async () => {
  const requestedMemberships = [];
  const destinations = [];
  const emitted = [];
  const recipientIds = Array.from({ length: 501 }, (_, index) => `recipient-${index}`);
  const roomsService = {
    async getRoomMemberUserIds(roomId, excludedUserId) {
      requestedMemberships.push({ roomId, excludedUserId });
      return recipientIds;
    },
  };
  const gateway = new RoomsGateway(roomsService, {});
  gateway.server = {
    to(rooms) {
      destinations.push(rooms);
      return {
        emit(event, payload) {
          emitted.push({ event, payload });
        },
      };
    },
  };

  await gateway.emitRoomMessageNotification("room-1", "author-1");
  gateway.emitRoomReadNotification("reader-1", "room-1");

  assert.deepEqual(requestedMemberships, [{ roomId: "room-1", excludedUserId: "author-1" }]);
  assert.equal(destinations.length, 3);
  assert.equal(destinations[0].length, 500);
  assert.equal(destinations[1].length, 1);
  assert.equal(destinations[2], "user:reader-1:notifications");
  assert.deepEqual(emitted[0], {
    event: "notifications:changed",
    payload: {
      source: "rooms",
      kind: "room-message",
      roomId: "room-1",
      unreadDelta: 1,
    },
  });
  assert.deepEqual(emitted[2], {
    event: "notifications:changed",
    payload: {
      source: "rooms",
      kind: "room-read",
      roomId: "room-1",
    },
  });
});

test("aggregate unread queries count all conversations in constant query count", { skip: !connectionString }, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const base = Date.now() - 60_000;
  const users = await Promise.all(
    ["reader", "first", "second"].map((label) =>
      prisma.user.create({
        data: {
          email: `${label}-unread-${unique}@example.com`,
          displayName: `${label} unread`,
          passwordHash: "unused",
        },
      })
    )
  );
  const [reader, first, second] = users;
  const matches = await Promise.all([
    prisma.match.create({
      data: {
        userAId: reader.id,
        userBId: first.id,
        status: MatchStatus.ACTIVE,
      },
    }),
    prisma.match.create({
      data: {
        userAId: reader.id,
        userBId: second.id,
        status: MatchStatus.ACTIVE,
      },
    }),
  ]);
  await prisma.matchReadState.create({
    data: {
      matchId: matches[0].id,
      userId: reader.id,
      lastReadAt: new Date(base + 2_000),
    },
  });
  await prisma.directMessage.createMany({
    data: [
      { matchId: matches[0].id, senderId: first.id, body: "old", createdAt: new Date(base + 1_000) },
      { matchId: matches[0].id, senderId: first.id, body: "new", createdAt: new Date(base + 3_000) },
      { matchId: matches[0].id, senderId: reader.id, body: "mine", createdAt: new Date(base + 4_000) },
      { matchId: matches[1].id, senderId: second.id, body: "one", createdAt: new Date(base + 1_000) },
      { matchId: matches[1].id, senderId: second.id, body: "two", createdAt: new Date(base + 2_000) },
    ],
  });

  const rooms = await Promise.all([
    prisma.chatRoom.create({ data: { name: `Active one ${unique}`, category: "Test", isActive: true } }),
    prisma.chatRoom.create({ data: { name: `Inactive ${unique}`, category: "Test", isActive: false } }),
    prisma.chatRoom.create({ data: { name: `Active two ${unique}`, category: "Test", isActive: true } }),
  ]);
  await prisma.roomMembership.createMany({
    data: rooms.map((room) => ({
      roomId: room.id,
      userId: reader.id,
      lastReadAt: new Date(base + 2_000),
    })),
  });
  await prisma.chatMessage.createMany({
    data: [
      { roomId: rooms[0].id, authorId: first.id, body: "old", createdAt: new Date(base + 1_000) },
      { roomId: rooms[0].id, authorId: first.id, body: "new", createdAt: new Date(base + 3_000) },
      { roomId: rooms[0].id, authorId: reader.id, body: "mine", createdAt: new Date(base + 4_000) },
      { roomId: rooms[0].id, authorId: first.id, body: "deleted", deletedAt: new Date(), createdAt: new Date(base + 5_000) },
      { roomId: rooms[1].id, authorId: first.id, body: "inactive", createdAt: new Date(base + 3_000) },
      { roomId: rooms[2].id, authorId: second.id, body: "new", createdAt: new Date(base + 3_000) },
    ],
  });

  try {
    const [directTotal, directByMatch, roomTotal, roomByRoom] = await Promise.all([
      countUnreadDirectMessages(prisma, reader.id),
      getUnreadDirectMessageCountsByMatch(prisma, reader.id),
      countUnreadRoomMessages(prisma, reader.id),
      getUnreadRoomMessageCountsByRoom(prisma, reader.id),
    ]);

    assert.equal(directTotal, 3);
    assert.equal(directByMatch.get(matches[0].id), 1);
    assert.equal(directByMatch.get(matches[1].id), 2);
    assert.equal(roomTotal, 2);
    assert.equal(roomByRoom.get(rooms[0].id), 1);
    assert.equal(roomByRoom.get(rooms[2].id), 1);
    assert.equal(roomByRoom.has(rooms[1].id), false);
  } finally {
    await prisma.chatRoom.deleteMany({ where: { id: { in: rooms.map((room) => room.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.$disconnect();
  }
});
