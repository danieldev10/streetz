UPDATE "Profile"
SET "discoveryLive" = true
WHERE "discoveryLive" = false;

ALTER TABLE "Profile"
ALTER COLUMN "discoveryLive" SET DEFAULT true;
