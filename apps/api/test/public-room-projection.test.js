const assert = require("node:assert/strict");
const test = require("node:test");
const { RoomsService } = require("../dist/src/rooms/rooms.service.js");
const { AccountStatus, EventStatus } = require("@prisma/client");

test("public room messages expose one avatar without private profile details", () => {
  const service = new RoomsService({}, {});
  const firstPhoto = { id: "photo-1", url: "https://cdn.example/photo-1.jpg", sortOrder: 0 };
  const message = service.toPublicRoomMessage({
    id: "message-1",
    roomId: "room-1",
    authorId: "user-1",
    authorName: "Ada",
    author: {
      id: "user-1",
      displayName: "Ada",
      email: "private@example.com",
      sexuality: "BISEXUAL",
      photos: [firstPhoto, { id: "photo-2", url: "https://cdn.example/photo-2.jpg", sortOrder: 1 }]
    },
    body: "See you there",
    gifUrl: null,
    createdAt: "2026-09-29T12:00:00.000Z"
  });

  assert.deepEqual(message.author.photos, [firstPhoto]);
  assert.equal("email" in message.author, false);
  assert.equal("sexuality" in message.author, false);
  assert.equal(message.author.bio, null);
  assert.deepEqual(message.author.interests, []);
});

test("deleted room authors retain their messages with an anonymous, unverified identity", () => {
  const service = new RoomsService({}, {});
  const message = service.toPublicRoomMessage({
    id: "message-deleted",
    roomId: "room-1",
    authorId: "former-user",
    authorName: "Previous name",
    author: {
      id: "former-user",
      displayName: "Previous name",
      accountStatus: AccountStatus.DELETED,
      isVerified: true,
      photos: [{ id: "old-photo", url: "https://cdn.example/old.jpg", sortOrder: 0 }]
    },
    body: "See you there",
    gifUrl: "https://media.tenor.com/example.gif",
    createdAt: "2026-10-01T12:00:00.000Z"
  });

  assert.equal(message.author.accountStatus, AccountStatus.DELETED);
  assert.equal(message.authorName, "Deleted member");
  assert.equal(message.author.displayName, "Deleted member");
  assert.equal(message.author.isVerified, false);
  assert.deepEqual(message.author.photos, []);
  assert.equal(message.body, "See you there");
  assert.equal(message.gifUrl, "https://media.tenor.com/example.gif");
});

test("public history includes deleted-account status without exposing other moderation states", async () => {
  const author = (id, accountStatus) => ({ id, displayName: "Deleted member", accountStatus, photos: [], profile: null });
  const source = (id, accountStatus) => ({
    id, roomId: "room-1", authorId: id, author: author(id, accountStatus),
    body: "Past message", gifUrl: null, createdAt: new Date("2026-10-01T12:00:00Z")
  });
  const service = new RoomsService({
    chatRoom: { findFirst: async () => ({
      id: "room-1", name: "Event chat", isActive: true, eventId: "event-1", _count: { memberships: 1, messages: 2 },
      event: { id: "event-1", title: "Event", startsAt: new Date("2099-10-31T17:00:00Z"), endsAt: null, status: EventStatus.PUBLISHED }
    }) },
    chatMessage: { findMany: async () => [source("deleted", AccountStatus.DELETED), source("suspended", AccountStatus.SUSPENDED)] }
  }, { signPhotoUrls: async (photos) => photos });

  const response = await service.getPublicRoom("room-1");
  assert.equal(response.messages.find((message) => message.id === "deleted").author.accountStatus, AccountStatus.DELETED);
  assert.equal("accountStatus" in response.messages.find((message) => message.id === "suspended").author, false);
  assert.equal(response.messages.length, 2);
});
