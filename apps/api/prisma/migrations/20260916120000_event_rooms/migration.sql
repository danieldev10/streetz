-- Event rooms replace independently-created rooms. Existing standalone rooms
-- remain as historical data, while all existing and future events receive one
-- room through the unique event relation.
ALTER TABLE "ChatRoom" ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "ChatRoom_eventId_key" ON "ChatRoom"("eventId");

ALTER TABLE "ChatRoom"
ADD CONSTRAINT "ChatRoom_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ChatRoom" (
  "id",
  "name",
  "description",
  "category",
  "isActive",
  "eventId",
  "createdAt",
  "updatedAt"
)
SELECT
  'event-room-' || md5(event."id"),
  event."title",
  'Event chat for ' || event."title" || '.',
  event."category",
  event."status" IN ('PUBLISHED', 'COMPLETED'),
  event."id",
  NOW(),
  NOW()
FROM "Event" AS event
WHERE NOT EXISTS (
  SELECT 1
  FROM "ChatRoom" AS room
  WHERE room."eventId" = event."id"
);
