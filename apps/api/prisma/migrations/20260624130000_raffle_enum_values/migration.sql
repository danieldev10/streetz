-- AlterEnum: add raffle payment purposes (kept in their own migration so the new
-- values are committed before any later migration/code references them).
ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'RAFFLE_TICKET';
ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_RAFFLE_TICKET';

-- AlterEnum: add raffle notification kinds.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'RAFFLE_TICKETS_CONFIRMED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'RAFFLE_WON';
