const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Prisma, PrismaClient } = require("@prisma/client");
const { DiscoveryService } = require("../dist/src/discovery/discovery.service.js");
const { MessagesService } = require("../dist/src/messages/messages.service.js");
const { ProfilesService } = require("../dist/src/profiles/profiles.service.js");
const { scoreSocialDiscoveryCandidate, socialDiscoveryScoreSql } = require("../dist/src/discovery/discovery-ranking.js");
const { calculateAge, getAdultBirthDateCutoff } = require("../dist/src/common/age.js");

const connectionString = process.env.TEST_DATABASE_URL;

test("adult eligibility includes the whole eighteenth birthday and handles leap days", () => {
  for (const today of [new Date(2026, 9, 13, 12), new Date(2024, 1, 29, 12)]) {
    const cutoff = getAdultBirthDateCutoff(today);
    assert.equal(calculateAge(cutoff, today), 18);
    assert.equal(calculateAge(new Date(cutoff.getTime() + 1), today), 17);
    assert.equal(cutoff.getMonth(), today.getMonth());
  }
});

test("social discovery and introductions use the same adult pool without dating preferences", { skip: !connectionString }, async (t) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const unique = randomUUID();
  const state = "Social-" + unique;
  const ids = [];
  const now = new Date();
  const storage = {
    signPhotoUrls: async (photos) => photos,
    buildPublicUrl: (key) => "https://cdn.example/" + key,
  };
  const discovery = new DiscoveryService(prisma, storage);
  const messages = new MessagesService(prisma, storage);
  async function createUser(label, changes = {}, profileChanges = {}, withPhoto = true) {
    const user = await prisma.user.create({
      data: {
        email: label + "-" + unique + "@example.com", displayName: label, passwordHash: "unused",
        subscriptionStatus: "ACTIVE", subscriptionEndsAt: new Date(now.getTime() + 86_400_000),
        faceVerificationStatus: "VERIFIED", createdAt: now, lastDiscoveryActiveAt: now,
        profile: { create: {
          bio: "I enjoy meeting people at local events.", birthDate: new Date("1998-01-01"),
          connectionStatus: "CHILL", city: "Test city", state, interests: ["Music", "Art", "Food"],
          ...profileChanges,
        } },
        ...(withPhoto ? { photos: { create: { url: "https://cdn.example/test.jpg", sortOrder: 0, slot: 0 } } } : {}),
        ...changes,
      },
      include: { profile: true, photos: true },
    });
    ids.push(user.id);
    return user;
  }
  try {
    const viewer = await createUser("viewer", { faceVerificationStatus: "NOT_STARTED" });
    const eligible = [];
    for (let index = 0; index < 125; index++) {
      eligible.push(await createUser("person-" + index, {}, {
        gender: ["MAN", "WOMAN", "NON_BINARY", "PREFER_NOT_TO_SAY"][index % 4],
        connectionStatus: ["CHILL", "PARTY", "FOODIE", "OPEN_TO_ANYTHING"][index % 4],
        interests: index % 2 ? ["Opera"] : ["Music", "Art", "Food"],
      }));
    }
    const oldPreferences = await createUser("old-preferences", {
      discoveryPreference: { create: { interestedInGenders: ["WOMAN"], minAge: 70, maxAge: 80, confirmedAt: now } },
    }, { discoveryGender: "MAN", gender: "MAN", showGender: false });
    const olderAdult = await createUser("older-adult", {}, { birthDate: new Date("1910-01-01") });
    const birthdayAdult = await createUser("eighteenth-birthday", {}, { birthDate: getAdultBirthDateCutoff(now) });
    const unconfirmed = await createUser("unconfirmed", { discoveryPreference: { create: {} } });
    eligible.push(oldPreferences, olderAdult, birthdayAdult, unconfirmed);
    const unverified = await createUser("unverified", { faceVerificationStatus: "FAILED" });
    const notStarted = await createUser("not-started", { faceVerificationStatus: "NOT_STARTED" });
    const bypassed = await createUser("bypassed", { faceVerificationOverrideReason: "PROTOTYPE_BYPASS" });
    eligible.push(unverified, notStarted, bypassed);

    const hidden = await Promise.all([
      createUser("underage", {}, { birthDate: new Date(now.getFullYear() - 17, 0, 1) }),
      createUser("withdrawn", {}, { discoveryLive: false }),
      createUser("missing-photo", {}, {}, false),
      createUser("incomplete", {}, { bio: "   " }),
      createUser("no-interests", {}, { interests: [] }),
      createUser("expired", { subscriptionEndsAt: new Date(now.getTime() - 1) }),
      createUser("inactive-membership", { subscriptionStatus: "INACTIVE" }),
      createUser("deactivated", { accountStatus: "DEACTIVATED" }),
      createUser("suspended", { accountStatus: "SUSPENDED" }),
      createUser("admin", { role: "ADMIN" }),
      createUser("another-state", {}, { state: state + "-other" }),
      createUser("blocked-by-viewer"), createUser("blocked-viewer"),
      ...["CLOSED", "DECLINED", "UNMATCHED", "BLOCKED"].map((status) => createUser("connection-" + status)),
    ]);
    const byName = new Map(hidden.map((user) => [user.displayName, user]));
    await prisma.userBlock.createMany({ data: [
      { blockerId: viewer.id, blockedId: byName.get("blocked-by-viewer").id },
      { blockedId: viewer.id, blockerId: byName.get("blocked-viewer").id },
    ] });
    await prisma.match.createMany({ data: ["CLOSED", "DECLINED", "UNMATCHED", "BLOCKED"].map((status) => {
      const targetId = byName.get("connection-" + status).id;
      const [userAId, userBId] = [viewer.id, targetId].sort();
      return { userAId, userBId, status };
    }) });

    await t.test("pagination reaches all eligible adults, including profiles beyond 100", async () => {
      const found = [];
      let cursor;
      do {
        const page = await discovery.getPeople(viewer.id, cursor);
        assert.ok(page.people.length <= 20);
        assert.equal(page.location.state, state);
        found.push(...page.people.map((person) => person.id));
        cursor = page.nextCursor;
        assert.ok(found.length <= eligible.length, "Pagination must terminate without repeated profiles");
      } while (cursor);
      assert.equal(new Set(found).size, found.length);
      assert.deepEqual(new Set(found), new Set(eligible.map((user) => user.id)));
      const first = await discovery.getPeople(viewer.id);
      assert.deepEqual(first.people.map((person) => person.id), found.slice(0, 20));
      await assert.rejects(discovery.getPeople(viewer.id, "no-longer-in-pool"), /cursor is no longer valid/);
      assert.deepEqual((await discovery.getPeople(viewer.id, found.at(-1))).people, []);
    });

    await t.test("SQL suggestions agree with the in-memory algorithm", async () => {
      const candidates = [eligible[0], eligible[1], oldPreferences];
      const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT candidate."id", ${socialDiscoveryScoreSql(viewer.profile, viewer.id, now)} AS score
        FROM "User" AS candidate JOIN "Profile" AS candidate_profile ON candidate_profile."userId" = candidate."id"
        WHERE candidate."id" IN (${Prisma.join(candidates.map((user) => user.id))})
      `);
      for (const row of rows) {
        const candidate = candidates.find((user) => user.id === row.id);
        assert.ok(Math.abs(row.score - scoreSocialDiscoveryCandidate(viewer.profile, candidate, viewer.id, now)) < 1e-9);
      }
    });

    await t.test("legacy saved preferences cannot hide profiles or force setup", async () => {
      const profile = await discovery.getPerson(viewer.id, oldPreferences.id);
      assert.equal(profile.id, oldPreferences.id);
      assert.equal(profile.gender, null, "Existing gender privacy setting still applies");
      const profiles = new ProfilesService(prisma, storage, { get: () => undefined });
      assert.equal((await profiles.getDiscoveryPreferences(viewer.id)).needsConfirmation, false);
      assert.equal((await profiles.getDiscoveryPreferences(oldPreferences.id)).needsConfirmation, false);
      assert.ok((await discovery.getCandidates(viewer.id)).candidates.length > 0);
      // Exercise the PostGIS path used by older clients as well.
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SET LOCAL search_path = public, extensions`;
        await transaction.$executeRaw`UPDATE "Profile" SET latitude = 6.5, longitude = 3.3,
          location = ST_SetSRID(ST_MakePoint(3.3, 6.5), 4326)::geography WHERE "userId" IN (${viewer.id}, ${oldPreferences.id})`;
      });
      const nearby = await discovery.getCandidates(viewer.id);
      assert.equal(nearby.algorithm, "social-v1");
      assert.ok(nearby.candidates.some((person) => person.id === oldPreferences.id));
      const liked = await discovery.recordAction(viewer.id, { targetUserId: oldPreferences.id, action: "LIKE" });
      assert.equal(liked.action.targetId, oldPreferences.id);
      await profiles.updateMyProfile(oldPreferences.id, { showGender: true });
      assert.equal((await discovery.getPerson(viewer.id, oldPreferences.id)).gender, "MAN");
      await profiles.updateMyProfile(oldPreferences.id, { showGender: false });
    });

    await t.test("shown profiles can receive an introduction without mutual age or gender preferences", async () => {
      const request = await messages.createConversationRequest(viewer.id, oldPreferences.id, "Hello from the social pool");
      assert.equal(request.created, true);
      assert.equal(request.conversation.status, "REQUESTED");
      const repeated = await messages.createConversationRequest(viewer.id, oldPreferences.id, "Do not duplicate");
      assert.equal(repeated.created, false);
      assert.equal(await prisma.directMessage.count({ where: { matchId: request.conversation.id } }), 1);
    });

    await t.test("unverified members can view profiles and message; only genuine verification earns a badge", async () => {
      assert.equal((await discovery.getPerson(viewer.id, unverified.id)).isVerified, false);
      assert.equal((await discovery.getPerson(viewer.id, notStarted.id)).isVerified, false);
      assert.equal((await discovery.getPerson(viewer.id, bypassed.id)).isVerified, false);
      assert.equal((await discovery.getPerson(viewer.id, eligible[0].id)).isVerified, true);
      const request = await messages.createConversationRequest(viewer.id, unverified.id, "No verification needed to say hello");
      assert.equal(request.created, true);
      assert.equal(request.conversation.user.isVerified, false);
      await prisma.user.update({ where: { id: notStarted.id }, data: { faceVerificationStatus: "VERIFIED", faceVerificationVerifiedAt: new Date() } });
      assert.equal((await discovery.getPerson(viewer.id, notStarted.id)).isVerified, true);
      await prisma.user.update({ where: { id: notStarted.id }, data: { faceVerificationStatus: "NOT_STARTED", faceVerificationVerifiedAt: null } });
      assert.equal((await discovery.getPerson(viewer.id, notStarted.id)).isVerified, false);
    });

    await t.test("hidden profiles remain unavailable for profile viewing, likes and new message requests", async () => {
      for (const user of hidden) {
        await assert.rejects(discovery.getPerson(viewer.id, user.id));
        await assert.rejects(discovery.recordAction(viewer.id, { targetUserId: user.id, action: "LIKE" }));
        await assert.rejects(messages.createConversationRequest(viewer.id, user.id, "Must not send"));
      }
      await prisma.profile.update({ where: { userId: viewer.id }, data: { discoveryLive: false } });
      await assert.rejects(discovery.getPeople(viewer.id), /Enter the discovery pool/);
      await assert.rejects(messages.createConversationRequest(viewer.id, eligible[0].id, "Must not send"), /discovery pool/);
      await prisma.profile.update({ where: { userId: viewer.id }, data: { discoveryLive: true, birthDate: new Date() } });
      await assert.rejects(discovery.getPeople(viewer.id), /Complete your profile/);
      await assert.rejects(messages.createConversationRequest(viewer.id, eligible[0].id, "Must not send"), /adult profiles/);
    });

    await t.test("guest preview includes preference-free adults while keeping private information out", async () => {
      const publicService = new DiscoveryService(prisma, storage);
      const preview = await publicService.getPublicPreview();
      assert.equal(preview.isPreview, true);
      assert.ok(preview.people.some((person) => eligible.some((user) => user.id === person.id)));
      for (const person of preview.people) {
        assert.deepEqual(Object.keys(person).sort(), ["age", "connectionStatus", "displayName", "id", "isVerified", "photos", "state"]);
        assert.ok(person.age >= 18);
      }
      const publicIds = new Set(preview.people.map((person) => person.id));
      for (const label of ["underage", "withdrawn", "missing-photo", "incomplete", "no-interests", "expired", "inactive-membership", "deactivated", "suspended", "admin"]) {
        assert.equal(publicIds.has(byName.get(label).id), false, label);
      }
    });

    await t.test("an empty state returns an empty page without hiding the selected location", async () => {
      await prisma.profile.update({ where: { userId: viewer.id }, data: { birthDate: new Date("1998-01-01"), state: state + "-empty" } });
      const result = await discovery.getPeople(viewer.id);
      assert.deepEqual(result.people, []);
      assert.equal(result.nextCursor, null);
      assert.equal(result.location.state, state + "-empty");
    });
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
