const assert = require("node:assert/strict");
const { test } = require("node:test");
const { AccountStatus, ConnectionStatus, DiscoveryGender, MatchStatus, SubscriptionStatus, UserRole } = require("@prisma/client");
const { MessagesService } = require("../dist/src/messages/messages.service.js");

function participant(id) {
  return {
    id,
    email: `${id}@example.com`,
    displayName: id === "a" ? "Ada" : "Bola",
    role: UserRole.USER,
    accountStatus: AccountStatus.ACTIVE,
    suspendedUntil: null,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    subscriptionEndsAt: new Date(Date.now() + 86_400_000),
    faceVerificationStatus: "NOT_STARTED",
    profile: {
      bio: "Complete profile",
      birthDate: new Date("1998-01-01"),
      gender: null,
      discoveryGender: DiscoveryGender.WOMAN,
      showGender: true,
      sexuality: null,
      connectionStatus: ConnectionStatus.JUST_FRIENDS,
      city: "Lagos",
      state: "Lagos",
      latitude: 6.5244,
      longitude: 3.3792,
      locationAccuracyMeters: 20,
      locationUpdatedAt: new Date(),
      maxDistanceKm: 50,
      interests: ["Music"],
      discoveryLive: true,
    },
    discoveryPreference: {
      interestedInGenders: [DiscoveryGender.WOMAN],
      minAge: 18,
      maxAge: 40,
      confirmedAt: new Date(),
    },
    photos: [{ id: `photo-${id}`, url: `https://example.com/${id}.jpg`, sortOrder: 0 }],
  };
}

test("a message request creates one pending conversation and one introduction", async () => {
  const users = { a: participant("a"), b: participant("b") };
  let conversation = null;
  const messages = [];
  const prisma = {
    user: {
      findUnique: async ({ where }) => users[where.id] ?? null,
    },
    userBlock: {
      findMany: async () => [],
    },
    match: {
      findUnique: async () => conversation,
      count: async () => 0,
    },
    ticket: {
      findMany: async () => [],
    },
    $transaction: async (callback) => callback({
      match: {
        create: async ({ data }) => {
          conversation = {
            id: "conversation-1",
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            acceptedAt: null,
            closedAt: null,
            userA: users.a,
            userB: users.b,
            messages,
            readStates: [],
          };
          return conversation;
        },
      },
      directMessage: {
        create: async ({ data }) => {
          const message = {
            id: "message-1",
            ...data,
            gifUrl: null,
            readAt: null,
            createdAt: new Date(),
            sender: { id: data.senderId, displayName: users[data.senderId].displayName },
          };
          messages.unshift(message);
          return message;
        },
      },
    }),
  };
  const storage = { signPhotoUrls: async (photos) => photos };
  const verification = { isRequired: () => false };
  const service = new MessagesService(prisma, storage, verification);

  const first = await service.createConversationRequest("a", "b", "Hi Bola");
  const second = await service.createConversationRequest("a", "b", "This must not be sent");

  assert.equal(first.created, true);
  assert.equal(first.conversation.status, MatchStatus.REQUESTED);
  assert.equal(first.conversation.requestDirection, "SENT");
  assert.equal(second.created, false);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, "Hi Bola");
});
