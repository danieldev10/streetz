ALTER TABLE "Event" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General';

CREATE INDEX "Event_category_status_startsAt_idx" ON "Event"("category", "status", "startsAt");
