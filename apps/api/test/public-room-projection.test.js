const assert = require("node:assert/strict");
const test = require("node:test");
const { RoomsService } = require("../dist/src/rooms/rooms.service.js");

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
