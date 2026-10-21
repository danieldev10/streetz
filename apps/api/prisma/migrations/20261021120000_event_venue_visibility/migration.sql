CREATE TYPE "EventType" AS ENUM ('PUBLIC', 'PRIVATE', 'EXCLUSIVE');
ALTER TABLE "Event" ADD COLUMN "eventType" "EventType" NOT NULL DEFAULT 'PUBLIC';

ALTER TYPE "BackgroundJobType" ADD VALUE 'EVENT_VENUE_EMAIL';
ALTER TYPE "BackgroundJobType" ADD VALUE 'EVENT_VENUE_SCAN';

CREATE TABLE "EventVenueEmail" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT,
  "guestOrderId" TEXT,
  "detailsHash" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventVenueEmail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventVenueEmail_holder_check" CHECK (("userId" IS NOT NULL) <> ("guestOrderId" IS NOT NULL)),
  CONSTRAINT "EventVenueEmail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EventVenueEmail_key_key" ON "EventVenueEmail"("key");
CREATE INDEX "EventVenueEmail_eventId_detailsHash_idx" ON "EventVenueEmail"("eventId", "detailsHash");
