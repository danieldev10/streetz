ALTER TABLE "ProfilePhoto" ADD COLUMN "slot" INTEGER;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "sortOrder", "createdAt", id) - 1 AS slot
  FROM "ProfilePhoto"
)
UPDATE "ProfilePhoto" AS photo
SET "slot" = ranked.slot
FROM ranked
WHERE photo.id = ranked.id;

ALTER TABLE "ProfilePhoto" ALTER COLUMN "slot" SET NOT NULL;
ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_slot_range" CHECK ("slot" BETWEEN 0 AND 3);
CREATE UNIQUE INDEX "ProfilePhoto_userId_slot_key" ON "ProfilePhoto"("userId", "slot");
