export type DiscoveryRankedCandidate<T extends { id: string }> = {
  candidate: T;
  distanceKm: number | null;
  score: number;
};

export function seededUnitInterval(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4_294_967_295;
}

export function selectDiscoveryDeck<T extends { id: string }>(
  ranked: Array<DiscoveryRankedCandidate<T>>,
  seed: string,
  deckSize = 12
) {
  if (ranked.length <= deckSize) return ranked;

  const explorationCount = Math.min(2, deckSize);
  const rankedCount = deckSize - explorationCount;
  const topRanked = ranked.slice(0, rankedCount);
  const exploration = ranked
    .slice(rankedCount)
    .sort((first, second) =>
      seededUnitInterval(`${seed}:${second.candidate.id}`) - seededUnitInterval(`${seed}:${first.candidate.id}`)
    )
    .slice(0, explorationCount);

  return [...topRanked, ...exploration];
}
