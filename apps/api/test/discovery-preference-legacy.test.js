const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DiscoveryGender, Gender, Sexuality } = require("@prisma/client");
const { suggestInterestedInGenders } = require("../dist/src/profiles/discovery-preference-suggestions.js");

test("legacy preference responses remain conservative for ambiguous identities", () => {
  assert.deepEqual(suggestInterestedInGenders(Gender.MAN, Sexuality.STRAIGHT), [DiscoveryGender.WOMAN]);
  assert.deepEqual(suggestInterestedInGenders(Gender.WOMAN, Sexuality.LESBIAN), [DiscoveryGender.WOMAN]);
  assert.deepEqual(suggestInterestedInGenders(Gender.NON_BINARY, Sexuality.QUEER), []);
  assert.deepEqual(suggestInterestedInGenders(Gender.WOMAN, Sexuality.ASEXUAL), []);
  assert.deepEqual(suggestInterestedInGenders(Gender.PREFER_NOT_TO_SAY, Sexuality.PREFER_NOT_TO_SAY), []);
});
