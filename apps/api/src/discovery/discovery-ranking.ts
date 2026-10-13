import { createHash } from "node:crypto";
import { ConnectionStatus, Prisma } from "@prisma/client";

type SocialDiscoveryProfile = {
  interests: string[];
  connectionStatus: ConnectionStatus;
};

export function scoreSocialDiscoveryCandidate(
  viewer: SocialDiscoveryProfile,
  candidate: {
    id: string;
    createdAt: Date;
    lastDiscoveryActiveAt: Date;
    profile: { interests: string[]; connectionStatus: ConnectionStatus | null } | null;
  },
  viewerId: string,
  now: Date
) {
  const viewerInterests = new Set(viewer.interests.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const candidateInterests = new Set(candidate.profile?.interests.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const sharedInterestCount = [...candidateInterests].filter((value) => viewerInterests.has(value)).length;
  const status = candidate.profile?.connectionStatus;
  const statusScore = status === viewer.connectionStatus ? 1
    : status === ConnectionStatus.OPEN_TO_ANYTHING || viewer.connectionStatus === ConnectionStatus.OPEN_TO_ANYTHING ? 0.6 : 0;
  const recency = (date: Date, days: number) => Math.max(0, 1 - Math.max(0, now.getTime() - date.getTime()) / (days * 86_400_000));
  const seed = `${viewerId}:${candidate.id}:${now.toISOString().slice(0, 10)}`;
  const variety = parseInt(createHash("md5").update(seed).digest("hex").slice(0, 8), 16) / 4_294_967_296;
  return Math.min(1, sharedInterestCount / 3) * 0.4 + statusScore * 0.25
    + recency(candidate.lastDiscoveryActiveAt, 30) * 0.15 + recency(candidate.createdAt, 14) * 0.1 + variety * 0.1;
}

/** Same score in PostgreSQL so the member list can paginate the entire eligible pool. */
export function socialDiscoveryScoreSql(viewer: SocialDiscoveryProfile, viewerId: string, now: Date) {
  const interests = [...new Set(viewer.interests.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  const interestArray = interests.length ? Prisma.sql`ARRAY[${Prisma.join(interests)}]::text[]` : Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`(
    LEAST(1.0, (SELECT count(DISTINCT lower(btrim(interest)))
      FROM unnest(candidate_profile."interests") AS interest
      WHERE lower(btrim(interest)) = ANY(${interestArray})) / 3.0) * 0.4
    + (CASE WHEN candidate_profile."connectionStatus" = CAST(${viewer.connectionStatus} AS "ConnectionStatus") THEN 1.0
      WHEN candidate_profile."connectionStatus" = 'OPEN_TO_ANYTHING' OR ${viewer.connectionStatus} = 'OPEN_TO_ANYTHING' THEN 0.6
      ELSE 0.0 END) * 0.25
    + GREATEST(0.0, 1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (${now}::timestamp - candidate."lastDiscoveryActiveAt"))) / (30.0 * 86400.0)) * 0.15
    + GREATEST(0.0, 1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (${now}::timestamp - candidate."createdAt"))) / (14.0 * 86400.0)) * 0.1
    + (('x' || substr(md5(${viewerId} || ':' || candidate."id" || ':' || ${now.toISOString().slice(0, 10)}), 1, 8))::bit(32)::bigint / 4294967296.0) * 0.1
  )::double precision`;
}

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
