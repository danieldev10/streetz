const assert = require("node:assert/strict");
const { test } = require("node:test");
const { selectDiscoveryDeck } = require("../dist/src/discovery/discovery-ranking.js");

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
