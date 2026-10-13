const assert = require("node:assert/strict");
const { test } = require("node:test");
const { scoreSocialDiscoveryCandidate, selectDiscoveryDeck } = require("../dist/src/discovery/discovery-ranking.js");

function rankedCandidates(count) {
  return Array.from({ length: count }, (_unused, index) => ({
    candidate: { id: `candidate-${index + 1}` },
    distanceKm: index,
    score: 100 - index,
  }));
}

test("deck keeps the top ten and adds two deterministic exploration candidates", () => {
  const ranked = rankedCandidates(30);
  const firstDeck = selectDiscoveryDeck(ranked, "viewer-1:2026-07-18");
  const secondDeck = selectDiscoveryDeck(ranked, "viewer-1:2026-07-18");

  assert.deepEqual(firstDeck, secondDeck);
  assert.deepEqual(
    firstDeck.slice(0, 10).map((item) => item.candidate.id),
    ranked.slice(0, 10).map((item) => item.candidate.id)
  );
  assert.equal(firstDeck.length, 12);
  assert.equal(new Set(firstDeck.map((item) => item.candidate.id)).size, 12);
  assert.ok(firstDeck.slice(10).every((item) => ranked.indexOf(item) >= 10));
});

test("small eligible pools are returned without artificial exclusions", () => {
  const ranked = rankedCandidates(9);
  assert.deepEqual(selectDiscoveryDeck(ranked, "viewer-1:2026-07-18"), ranked);
});

test("social suggestions reward shared interests, status, activity and new accounts", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const viewer = { interests: ["Music", "Food", "Art"], connectionStatus: "CHILL" };
  const candidate = {
    id: "candidate", createdAt: now, lastDiscoveryActiveAt: now,
    profile: { interests: [" music ", "FOOD", "Art"], connectionStatus: "CHILL" },
  };
  const score = (overrides) => scoreSocialDiscoveryCandidate(viewer, { ...candidate, ...overrides }, "viewer", now);
  const best = score({});
  assert.equal(best, score({}));
  assert.ok(best > score({ profile: { ...candidate.profile, interests: ["Opera"] } }));
  assert.ok(best > score({ profile: { ...candidate.profile, connectionStatus: "PARTY" } }));
  assert.ok(score({ profile: { ...candidate.profile, connectionStatus: "OPEN_TO_ANYTHING" } }) > score({ profile: { ...candidate.profile, connectionStatus: "PARTY" } }));
  assert.ok(best > score({ lastDiscoveryActiveAt: new Date("2026-08-01") }));
  assert.ok(best > score({ createdAt: new Date("2026-08-01") }));
  assert.equal(best, score({ profile: { ...candidate.profile, interests: ["Music", "Music", "Food", "Art", ""] } }));
  assert.equal(best, score({ profile: { ...candidate.profile, gender: "MAN", sexuality: "STRAIGHT", birthDate: new Date("1950-01-01") } }));
});
