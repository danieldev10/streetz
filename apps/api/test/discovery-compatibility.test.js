const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DiscoveryGender, Gender, Sexuality } = require("@prisma/client");
const { areDiscoveryProfilesCompatible } = require("../dist/src/discovery/discovery-compatibility.js");
const { suggestInterestedInGenders } = require("../dist/src/profiles/discovery-preference-suggestions.js");

const now = new Date("2026-07-18T12:00:00.000Z");

function profile(overrides = {}) {
  return {
    birthDate: new Date("1996-01-01T00:00:00.000Z"),
    discoveryGender: DiscoveryGender.WOMAN,
    interestedInGenders: [DiscoveryGender.MAN],
    minAge: 18,
    maxAge: 45,
    ...overrides,
  };
}

test("compatibility requires mutual gender interest", () => {
  const woman = profile();
  const interestedMan = profile({
    discoveryGender: DiscoveryGender.MAN,
    interestedInGenders: [DiscoveryGender.WOMAN],
  });
  const uninterestedMan = { ...interestedMan, interestedInGenders: [DiscoveryGender.MAN] };

  assert.equal(areDiscoveryProfilesCompatible(woman, interestedMan, now), true);
  assert.equal(areDiscoveryProfilesCompatible(woman, uninterestedMan, now), false);
});

test("compatibility requires both age ranges", () => {
  const woman = profile();
  const man = profile({
    discoveryGender: DiscoveryGender.MAN,
    interestedInGenders: [DiscoveryGender.WOMAN],
    minAge: 18,
    maxAge: 25,
  });

  assert.equal(areDiscoveryProfilesCompatible(woman, man, now), false);
});

test("identity suggestions remain conservative for ambiguous identities", () => {
  assert.deepEqual(suggestInterestedInGenders(Gender.MAN, Sexuality.STRAIGHT), [DiscoveryGender.WOMAN]);
  assert.deepEqual(suggestInterestedInGenders(Gender.WOMAN, Sexuality.LESBIAN), [DiscoveryGender.WOMAN]);
  assert.deepEqual(suggestInterestedInGenders(Gender.NON_BINARY, Sexuality.QUEER), []);
  assert.deepEqual(suggestInterestedInGenders(Gender.WOMAN, Sexuality.ASEXUAL), []);
  assert.deepEqual(suggestInterestedInGenders(Gender.PREFER_NOT_TO_SAY, Sexuality.PREFER_NOT_TO_SAY), []);
});
