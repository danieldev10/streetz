CREATE TABLE IF NOT EXISTS "MatchReadState" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MatchReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MatchReadState_matchId_userId_key" ON "MatchReadState"("matchId", "userId");
CREATE INDEX IF NOT EXISTS "MatchReadState_userId_idx" ON "MatchReadState"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MatchReadState_matchId_fkey'
  ) THEN
    ALTER TABLE "MatchReadState"
      ADD CONSTRAINT "MatchReadState_matchId_fkey"
      FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MatchReadState_userId_fkey'
  ) THEN
    ALTER TABLE "MatchReadState"
      ADD CONSTRAINT "MatchReadState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "RoomMembership"
  ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "MatchReadState" ("id", "matchId", "userId", "lastReadAt", "createdAt", "updatedAt")
SELECT
  CONCAT('mrs_', md5(participant."matchId" || ':' || participant."userId")),
  participant."matchId",
  participant."userId",
  participant."lastActivityAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    "Match"."id" AS "matchId",
    "Match"."userAId" AS "userId",
    COALESCE(MAX("DirectMessage"."createdAt"), "Match"."createdAt") AS "lastActivityAt"
  FROM "Match"
  LEFT JOIN "DirectMessage" ON "DirectMessage"."matchId" = "Match"."id"
  GROUP BY "Match"."id", "Match"."userAId", "Match"."createdAt"

  UNION ALL

  SELECT
    "Match"."id" AS "matchId",
    "Match"."userBId" AS "userId",
    COALESCE(MAX("DirectMessage"."createdAt"), "Match"."createdAt") AS "lastActivityAt"
  FROM "Match"
  LEFT JOIN "DirectMessage" ON "DirectMessage"."matchId" = "Match"."id"
  GROUP BY "Match"."id", "Match"."userBId", "Match"."createdAt"
) participant
ON CONFLICT ("matchId", "userId") DO NOTHING;

UPDATE "RoomMembership"
SET "lastReadAt" = CURRENT_TIMESTAMP
WHERE "lastReadAt" IS NULL;
