UPDATE "Event"
SET "category" = 'Theatre'
WHERE "category" = 'Performing & Visual Arts';

ALTER TABLE "Event" ALTER COLUMN "category" DROP DEFAULT;
