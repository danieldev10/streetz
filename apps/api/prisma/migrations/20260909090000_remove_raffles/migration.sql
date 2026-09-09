BEGIN;

-- This product is still in alpha, so remove all raffle-related test data before
-- removing the schema that supported it.
DELETE FROM "SupportRequest" WHERE "category" = 'RAFFLES';
DELETE FROM "NotificationSeen" WHERE "kind" IN ('RAFFLE_TICKETS_CONFIRMED', 'RAFFLE_WON');
DELETE FROM "Payment" WHERE "purpose" IN ('RAFFLE_TICKET', 'MEMBERSHIP_RAFFLE_TICKET');

-- RaffleDraw and RaffleEntry reference each other through the winner relation.
-- CASCADE removes that cross-table foreign key before the draw table is dropped.
DROP TABLE "RaffleEntry" CASCADE;
DROP TABLE "RaffleDraw";

DELETE FROM "Event" WHERE "kind" = 'RAFFLE';
DROP INDEX "Event_kind_status_startsAt_idx";
ALTER TABLE "Event" DROP COLUMN "kind";

CREATE TYPE "PaymentPurpose_new" AS ENUM (
  'SUBSCRIPTION',
  'EVENT_TICKET',
  'MEMBERSHIP_EVENT_TICKET'
);
ALTER TABLE "Payment"
  ALTER COLUMN "purpose" TYPE "PaymentPurpose_new"
  USING ("purpose"::text::"PaymentPurpose_new");
DROP TYPE "PaymentPurpose";
ALTER TYPE "PaymentPurpose_new" RENAME TO "PaymentPurpose";

CREATE TYPE "NotificationKind_new" AS ENUM (
  'ROOM_CREATED',
  'EVENT_PUBLISHED',
  'MATCH_CREATED',
  'TICKET_CONFIRMED',
  'SUBSCRIPTION_EXPIRING',
  'REPORT_STATUS_UPDATED',
  'EVENT_REMINDER',
  'EVENT_UPDATED',
  'EVENT_CANCELLED',
  'PAYMENT_FAILED',
  'SUBSCRIPTION_PAYMENT_SUCCESS'
);
ALTER TABLE "NotificationSeen"
  ALTER COLUMN "kind" TYPE "NotificationKind_new"
  USING ("kind"::text::"NotificationKind_new");
DROP TYPE "NotificationKind";
ALTER TYPE "NotificationKind_new" RENAME TO "NotificationKind";

CREATE TYPE "SupportRequestCategory_new" AS ENUM (
  'ACCOUNT_LOGIN',
  'MEMBERSHIP_PAYMENT',
  'EVENTS_TICKETS',
  'GUEST_TICKETS',
  'PROFILE_VERIFICATION',
  'DISCOVERY_PRIVACY',
  'ROOMS_MESSAGES',
  'SAFETY_REPORT',
  'TECHNICAL',
  'OTHER'
);
ALTER TABLE "SupportRequest"
  ALTER COLUMN "category" TYPE "SupportRequestCategory_new"
  USING ("category"::text::"SupportRequestCategory_new");
DROP TYPE "SupportRequestCategory";
ALTER TYPE "SupportRequestCategory_new" RENAME TO "SupportRequestCategory";

DROP TYPE "EventKind";
DROP TYPE "RaffleStatus";
DROP TYPE "RaffleEntryStatus";

COMMIT;
