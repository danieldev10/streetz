CREATE TYPE "DiscoveryGender" AS ENUM ('WOMAN', 'MAN', 'NON_BINARY');

ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "User" SET "lastActiveAt" = "updatedAt";
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

ALTER TABLE "Profile"
ADD COLUMN "discoveryGender" "DiscoveryGender",
ADD COLUMN "showGender" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Profile"
SET "discoveryGender" = CASE
  WHEN "gender" = 'WOMAN' THEN 'WOMAN'::"DiscoveryGender"
  WHEN "gender" = 'MAN' THEN 'MAN'::"DiscoveryGender"
  WHEN "gender" = 'NON_BINARY' THEN 'NON_BINARY'::"DiscoveryGender"
  ELSE NULL
END;

CREATE INDEX "Profile_discoveryGender_birthDate_idx" ON "Profile"("discoveryGender", "birthDate");

CREATE TABLE "DiscoveryPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "interestedInGenders" "DiscoveryGender"[] NOT NULL DEFAULT ARRAY[]::"DiscoveryGender"[],
  "minAge" INTEGER NOT NULL DEFAULT 18,
  "maxAge" INTEGER NOT NULL DEFAULT 100,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscoveryPreference_age_range" CHECK ("minAge" BETWEEN 18 AND 100 AND "maxAge" BETWEEN 18 AND 100 AND "minAge" <= "maxAge")
);

CREATE UNIQUE INDEX "DiscoveryPreference_userId_key" ON "DiscoveryPreference"("userId");
CREATE INDEX "DiscoveryPreference_confirmedAt_idx" ON "DiscoveryPreference"("confirmedAt");
CREATE INDEX "DiscoveryPreference_interestedInGenders_idx" ON "DiscoveryPreference" USING GIN ("interestedInGenders");
ALTER TABLE "DiscoveryPreference" ADD CONSTRAINT "DiscoveryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DiscoveryPreference" ("id", "userId", "interestedInGenders", "minAge", "maxAge", "confirmedAt", "createdAt", "updatedAt")
SELECT
  'dp_' || md5(random()::text || profile."userId"),
  profile."userId",
  CASE
    WHEN profile."sexuality" = 'STRAIGHT' AND profile."gender" = 'MAN' THEN ARRAY['WOMAN'::"DiscoveryGender"]
    WHEN profile."sexuality" = 'STRAIGHT' AND profile."gender" = 'WOMAN' THEN ARRAY['MAN'::"DiscoveryGender"]
    WHEN profile."sexuality" = 'GAY' AND profile."gender" = 'MAN' THEN ARRAY['MAN'::"DiscoveryGender"]
    WHEN profile."sexuality" = 'LESBIAN' AND profile."gender" = 'WOMAN' THEN ARRAY['WOMAN'::"DiscoveryGender"]
    WHEN profile."sexuality" IN ('BISEXUAL', 'PANSEXUAL') THEN ARRAY['WOMAN'::"DiscoveryGender", 'MAN'::"DiscoveryGender", 'NON_BINARY'::"DiscoveryGender"]
    ELSE ARRAY[]::"DiscoveryGender"[]
  END,
  18,
  100,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Profile" AS profile;

CREATE TABLE "DiscoveryImpression" (
  "id" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rank" INTEGER NOT NULL,
  "score" DOUBLE PRECISION,
  "algorithm" TEXT NOT NULL,
  CONSTRAINT "DiscoveryImpression_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscoveryImpression_viewerId_shownAt_idx" ON "DiscoveryImpression"("viewerId", "shownAt");
CREATE INDEX "DiscoveryImpression_viewerId_candidateId_shownAt_idx" ON "DiscoveryImpression"("viewerId", "candidateId", "shownAt");
CREATE INDEX "DiscoveryImpression_candidateId_shownAt_idx" ON "DiscoveryImpression"("candidateId", "shownAt");
ALTER TABLE "DiscoveryImpression" ADD CONSTRAINT "DiscoveryImpression_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryImpression" ADD CONSTRAINT "DiscoveryImpression_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
