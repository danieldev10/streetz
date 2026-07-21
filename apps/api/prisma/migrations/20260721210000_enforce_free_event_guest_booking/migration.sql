-- Free standard events are always available to verified-email guests.
-- This also repairs free events created after the initial guest-ticket migration
-- with the legacy MEMBERS_ONLY value.
UPDATE "Event" AS event
SET "bookingAccess" = 'PUBLIC'::"EventBookingAccess"
WHERE event."kind" = 'STANDARD'
  AND NOT EXISTS (
    SELECT 1
    FROM "TicketType" AS ticket_type
    WHERE ticket_type."eventId" = event."id"
      AND ticket_type."priceKobo" > 0
  );

UPDATE "Event" AS event
SET "bookingAccess" = 'MEMBERS_ONLY'::"EventBookingAccess"
WHERE event."kind" = 'STANDARD'
  AND EXISTS (
    SELECT 1
    FROM "TicketType" AS ticket_type
    WHERE ticket_type."eventId" = event."id"
      AND ticket_type."priceKobo" > 0
  );
