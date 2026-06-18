UPDATE "Match" AS match
SET "userAConnectionStatusAtMatch" = profile."connectionStatus"
FROM "Profile" AS profile
WHERE match."userAId" = profile."userId"
  AND match."userAConnectionStatusAtMatch" IS NULL
  AND profile."connectionStatus" IS NOT NULL;

UPDATE "Match" AS match
SET "userBConnectionStatusAtMatch" = profile."connectionStatus"
FROM "Profile" AS profile
WHERE match."userBId" = profile."userId"
  AND match."userBConnectionStatusAtMatch" IS NULL
  AND profile."connectionStatus" IS NOT NULL;
