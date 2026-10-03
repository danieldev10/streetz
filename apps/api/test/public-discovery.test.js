const assert = require("node:assert/strict");
const test = require("node:test");
require("reflect-metadata");
const { GUARDS_METADATA, HEADERS_METADATA } = require("@nestjs/common/constants");
const { DiscoveryService } = require("../dist/src/discovery/discovery.service.js");
const { DiscoveryController } = require("../dist/src/discovery/discovery.controller.js");
const { PublicDiscoveryController } = require("../dist/src/discovery/public-discovery.controller.js");
const { JwtAuthGuard } = require("../dist/src/auth/guards/jwt-auth.guard.js");
const { ActiveSubscriptionGuard } = require("../dist/src/auth/guards/active-subscription.guard.js");

function candidate(overrides = {}) {
  return {
    id: "user-1",
    displayName: "Ada",
    email: "private@example.com",
    discoveryPreference: { interestedInGenders: ["WOMAN"], minAge: 21 },
    profile: {
      bio: "Private biography",
      birthDate: new Date("1995-06-12T00:00:00Z"),
      connectionStatus: "FOODIE",
      city: "Ikeja",
      state: "Lagos",
      interests: ["Private interest"],
      sexuality: "BISEXUAL",
      latitude: 6.6,
      longitude: 3.3,
    },
    photos: [{
      id: "photo-1",
      url: "https://old.example/original.jpg",
      objectKey: "profile/original.jpg",
      thumbObjectKey: "profile/thumb.jpg",
      blurDataUrl: "data:image/jpeg;base64,preview",
      fullUrl: "https://private.example/full.jpg",
      userId: "user-1",
    }],
    ...overrides,
  };
}

function createService(rows, required = true) {
  let query;
  const service = new DiscoveryService(
    { user: { findMany: async (args) => { query = args; return rows; } } },
    { buildPublicUrl: (key) => `https://cdn.example/${key}` },
    { isRequired: () => required }
  );
  return { service, getQuery: () => query };
}

test("guest preview projects basic fields and one thumbnail without private profile data", async () => {
  const { service } = createService([candidate()]);
  const result = await service.getPublicPreview();
  assert.equal(result.isPreview, true);
  assert.equal(result.people.length, 1);
  assert.deepEqual(Object.keys(result.people[0]).sort(), ["age", "connectionStatus", "displayName", "id", "photos", "state"]);
  assert.equal(result.people[0].state, "Lagos");
  assert.equal(typeof result.people[0].age, "number");
  assert.deepEqual(result.people[0].photos, [{
    id: "photo-1", url: "https://cdn.example/profile/thumb.jpg", thumbUrl: "https://cdn.example/profile/thumb.jpg",
    blurDataUrl: "data:image/jpeg;base64,preview", sortOrder: 0,
  }]);
  const serialized = JSON.stringify(result);
  for (const sensitive of ["private@example.com", "Private biography", "Private interest", "BISEXUAL", "original.jpg", "full.jpg", "birthDate", "objectKey", "latitude", "discoveryPreference"]) {
    assert.equal(serialized.includes(sensitive), false, `Unexpected public data: ${sensitive}`);
  }
});

test("guest database read excludes withdrawn and ineligible accounts and has a fixed limit", async () => {
  const { service, getQuery } = createService([]);
  assert.deepEqual(await service.getPublicPreview(), { people: [], isPreview: true });
  const query = getQuery();
  assert.equal(query.take, 12);
  assert.equal(query.cursor, undefined);
  assert.equal(query.where.profile.is.discoveryLive, true);
  assert.equal(query.where.accountStatus, "ACTIVE");
  assert.equal(query.where.role, "USER");
  assert.equal(query.where.subscriptionStatus, "ACTIVE");
  assert.ok(query.where.subscriptionEndsAt.gt instanceof Date);
  assert.equal(query.where.faceVerificationStatus, "VERIFIED");
  assert.equal(query.where.discoveryPreference.is.confirmedAt.not, null);
  assert.equal(query.where.discoveryPreference.is.interestedInGenders.isEmpty, false);
  assert.ok(query.where.profile.is.birthDate.lte instanceof Date);
  assert.equal(query.select.email, undefined);
  assert.equal(query.select.photos.take, 1);
  assert.equal(query.select.profile.select.sexuality, undefined);
  assert.equal(query.select.profile.select.latitude, undefined);
});

test("preview respects optional verification mode and filters incomplete or underage profiles", async () => {
  const complete = candidate();
  const { service, getQuery } = createService([
    complete,
    candidate({ id: "empty-bio", profile: { ...complete.profile, bio: "   " } }),
    candidate({ id: "missing-photo", photos: [] }),
    candidate({ id: "missing-profile", profile: null }),
    candidate({ id: "underage", profile: { ...complete.profile, birthDate: new Date() } }),
  ], false);
  const result = await service.getPublicPreview();
  assert.deepEqual(result.people.map((person) => person.id), ["user-1"]);
  assert.equal(getQuery().where.faceVerificationStatus, undefined);
});

test("legacy thumbnail URLs remain usable without exposing original photo fields", async () => {
  const { service } = createService([candidate({ photos: [{ id: "legacy", url: "https://cdn.example/original.jpg", thumbUrl: "https://cdn.example/thumb.jpg" }] })]);
  assert.equal((await service.getPublicPreview()).people[0].photos[0].url, "https://cdn.example/thumb.jpg");
});

test("public preview is uncached and member discovery retains its authentication guards", () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, DiscoveryController), [JwtAuthGuard, ActiveSubscriptionGuard]);
  assert.equal(Reflect.getMetadata(GUARDS_METADATA, PublicDiscoveryController), undefined);
  assert.deepEqual(Reflect.getMetadata(HEADERS_METADATA, PublicDiscoveryController.prototype.getPeople), [{ name: "Cache-Control", value: "no-store" }]);
  assert.equal(Reflect.getMetadata("THROTTLER:LIMITdefault", PublicDiscoveryController.prototype.getPeople), 30);
});
