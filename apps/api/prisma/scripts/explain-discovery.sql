\set ON_ERROR_STOP on

SET search_path = public, extensions;

CREATE INDEX IF NOT EXISTS "Profile_location_gist_idx" ON "Profile" USING GIST ("location");

DELETE FROM "User" WHERE "id" = 'perf-viewer' OR "id" LIKE 'perf-candidate-%';

INSERT INTO "User" (
  "id", "email", "displayName", "passwordHash", "role", "subscriptionStatus", "subscriptionEndsAt",
  "accountStatus", "createdAt", "updatedAt", "lastDiscoveryActiveAt"
) VALUES (
  'perf-viewer', 'perf-viewer@example.invalid', 'Performance Viewer', 'unused', 'USER', 'ACTIVE', NOW() + INTERVAL '1 year',
  'ACTIVE', NOW(), NOW(), NOW()
);

INSERT INTO "Profile" (
  "id", "userId", "bio", "birthDate", "gender", "discoveryGender", "sexuality", "connectionStatus",
  "city", "state", "latitude", "longitude", "location", "locationUpdatedAt", "maxDistanceKm", "interests",
  "discoveryLive", "createdAt", "updatedAt"
) VALUES (
  'perf-profile-viewer', 'perf-viewer', 'Performance viewer profile', DATE '1994-01-01', 'MAN', 'MAN', 'BISEXUAL', 'DATING',
  'Lagos', 'Lagos', 6.5244, 3.3792, ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography, NOW(), 50,
  ARRAY['music', 'travel'], TRUE, NOW(), NOW()
);

INSERT INTO "DiscoveryPreference" (
  "id", "userId", "interestedInGenders", "minAge", "maxAge", "confirmedAt", "createdAt", "updatedAt"
) VALUES (
  'perf-preference-viewer', 'perf-viewer', ARRAY['WOMAN', 'MAN', 'NON_BINARY']::"DiscoveryGender"[], 21, 45, NOW(), NOW(), NOW()
);

INSERT INTO "User" (
  "id", "email", "displayName", "passwordHash", "role", "subscriptionStatus", "subscriptionEndsAt",
  "accountStatus", "createdAt", "updatedAt", "lastDiscoveryActiveAt"
)
SELECT
  'perf-candidate-' || number,
  'perf-candidate-' || number || '@example.invalid',
  'Candidate ' || number,
  'unused',
  'USER',
  'ACTIVE',
  NOW() + INTERVAL '1 year',
  'ACTIVE',
  NOW(),
  NOW(),
  NOW() - ((number % 30) || ' days')::interval
FROM generate_series(1, 5000) AS number;

INSERT INTO "Profile" (
  "id", "userId", "bio", "birthDate", "gender", "discoveryGender", "sexuality", "connectionStatus",
  "city", "state", "latitude", "longitude", "location", "locationUpdatedAt", "maxDistanceKm", "interests",
  "discoveryLive", "createdAt", "updatedAt"
)
SELECT
  'perf-profile-' || number,
  'perf-candidate-' || number,
  'Realistic performance profile with enough content for discovery ranking.',
  DATE '1994-01-01' + ((number % 365) || ' days')::interval,
  CASE number % 3 WHEN 0 THEN 'MAN'::"Gender" WHEN 1 THEN 'WOMAN'::"Gender" ELSE 'NON_BINARY'::"Gender" END,
  CASE number % 3 WHEN 0 THEN 'MAN'::"DiscoveryGender" WHEN 1 THEN 'WOMAN'::"DiscoveryGender" ELSE 'NON_BINARY'::"DiscoveryGender" END,
  'BISEXUAL',
  CASE number % 4 WHEN 0 THEN 'MEET_NOW'::"ConnectionStatus" WHEN 1 THEN 'FWB'::"ConnectionStatus" WHEN 2 THEN 'JUST_FRIENDS'::"ConnectionStatus" ELSE 'DATING'::"ConnectionStatus" END,
  'Lagos',
  'Lagos',
  6.5244 + floor(number / 100.0) * 0.001,
  3.3792 + (number % 100) * 0.001,
  ST_SetSRID(ST_MakePoint(3.3792 + (number % 100) * 0.001, 6.5244 + floor(number / 100.0) * 0.001), 4326)::geography,
  NOW(),
  50,
  ARRAY['music', 'travel', CASE number % 3 WHEN 0 THEN 'food' WHEN 1 THEN 'art' ELSE 'fitness' END],
  TRUE,
  NOW(),
  NOW()
FROM generate_series(1, 5000) AS number;

INSERT INTO "DiscoveryPreference" (
  "id", "userId", "interestedInGenders", "minAge", "maxAge", "confirmedAt", "createdAt", "updatedAt"
)
SELECT
  'perf-preference-' || number,
  'perf-candidate-' || number,
  CASE WHEN number % 3 = 0 THEN ARRAY['WOMAN']::"DiscoveryGender"[] ELSE ARRAY['MAN']::"DiscoveryGender"[] END,
  18,
  55,
  NOW(),
  NOW(),
  NOW()
FROM generate_series(1, 5000) AS number;

INSERT INTO "ProfilePhoto" ("id", "userId", "url", "sortOrder", "slot", "createdAt")
SELECT
  'perf-photo-' || number,
  'perf-candidate-' || number,
  'https://example.invalid/perf/' || number || '.jpg',
  0,
  1,
  NOW()
FROM generate_series(1, 5000) AS number;

ANALYZE "User";
ANALYZE "Profile";
ANALYZE "DiscoveryPreference";
ANALYZE "ProfilePhoto";

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH origin AS (
  SELECT ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography AS geog
)
SELECT
  candidate."id",
  (ST_Distance(candidate_profile."location", origin.geog) / 1000.0)::double precision AS "distanceKm"
FROM origin
JOIN "User" AS candidate ON TRUE
JOIN "Profile" AS candidate_profile ON candidate_profile."userId" = candidate."id"
JOIN "DiscoveryPreference" AS candidate_preference ON candidate_preference."userId" = candidate."id"
WHERE candidate."id" <> 'perf-viewer'
  AND candidate."accountStatus" = 'ACTIVE'
  AND candidate."role" = 'USER'
  AND candidate."subscriptionStatus" = 'ACTIVE'
  AND candidate."subscriptionEndsAt" > NOW()
  AND candidate_profile."bio" IS NOT NULL
  AND candidate_profile."birthDate" > DATE '1980-01-01'
  AND candidate_profile."birthDate" <= DATE '2005-01-01'
  AND candidate_profile."discoveryGender" = ANY(ARRAY['WOMAN', 'MAN', 'NON_BINARY']::"DiscoveryGender"[])
  AND candidate_preference."interestedInGenders" @> ARRAY['MAN'::"DiscoveryGender"]
  AND candidate_preference."confirmedAt" IS NOT NULL
  AND candidate_preference."minAge" <= 32
  AND candidate_preference."maxAge" >= 32
  AND candidate_profile."city" IS NOT NULL
  AND candidate_profile."state" IS NOT NULL
  AND candidate_profile."connectionStatus" IS NOT NULL
  AND candidate_profile."discoveryLive" = TRUE
  AND cardinality(candidate_profile."interests") > 0
  AND candidate_profile."location" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "ProfilePhoto" AS photo WHERE photo."userId" = candidate."id")
  AND ST_DWithin(candidate_profile."location", origin.geog, 50000)
ORDER BY ST_Distance(candidate_profile."location", origin.geog) ASC, candidate."lastDiscoveryActiveAt" DESC
LIMIT 100;

\echo 'OPTIMIZED MATERIALIZED SPATIAL PLAN'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH origin AS (
  SELECT ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography AS geog
), nearby_profiles AS MATERIALIZED (
  SELECT
    candidate_profile."userId",
    candidate_profile."location",
    ST_Distance(candidate_profile."location", origin.geog) AS distance_meters
  FROM origin
  JOIN "Profile" AS candidate_profile ON TRUE
  WHERE candidate_profile."bio" IS NOT NULL
    AND candidate_profile."birthDate" > DATE '1980-01-01'
    AND candidate_profile."birthDate" <= DATE '2005-01-01'
    AND candidate_profile."discoveryGender" = ANY(ARRAY['WOMAN', 'MAN', 'NON_BINARY']::"DiscoveryGender"[])
    AND candidate_profile."city" IS NOT NULL
    AND candidate_profile."state" IS NOT NULL
    AND candidate_profile."connectionStatus" IS NOT NULL
    AND candidate_profile."discoveryLive" = TRUE
    AND cardinality(candidate_profile."interests") > 0
    AND candidate_profile."location" IS NOT NULL
    AND ST_DWithin(candidate_profile."location", origin.geog, 50000)
)
SELECT
  candidate."id",
  (nearby_profiles.distance_meters / 1000.0)::double precision AS "distanceKm"
FROM nearby_profiles
JOIN "User" AS candidate ON candidate."id" = nearby_profiles."userId"
JOIN "DiscoveryPreference" AS candidate_preference ON candidate_preference."userId" = candidate."id"
WHERE candidate."id" <> 'perf-viewer'
  AND candidate."accountStatus" = 'ACTIVE'
  AND candidate."role" = 'USER'
  AND candidate."subscriptionStatus" = 'ACTIVE'
  AND candidate."subscriptionEndsAt" > NOW()
  AND candidate_preference."interestedInGenders" @> ARRAY['MAN'::"DiscoveryGender"]
  AND candidate_preference."confirmedAt" IS NOT NULL
  AND candidate_preference."minAge" <= 32
  AND candidate_preference."maxAge" >= 32
  AND EXISTS (SELECT 1 FROM "ProfilePhoto" AS photo WHERE photo."userId" = candidate."id")
ORDER BY nearby_profiles.distance_meters ASC, candidate."lastDiscoveryActiveAt" DESC
LIMIT 100;
