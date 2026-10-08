CREATE TYPE "BackgroundJobType" AS ENUM ('TICKET_EMAIL', 'PASSWORD_RESET_EMAIL', 'GUEST_VERIFICATION_EMAIL', 'SUPPORT_RECEIVED_EMAIL', 'SUPPORT_REPLY_EMAIL', 'RESERVATION_CLEANUP', 'PAYMENT_SCAN', 'PAYMENT_RECONCILIATION');
CREATE TYPE "BackgroundJobState" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "type" "BackgroundJobType" NOT NULL,
  "state" "BackgroundJobState" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "encryptedPayload" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "leaseToken" TEXT,
  "lockedUntil" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJob_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" > 0)
);
CREATE UNIQUE INDEX "BackgroundJob_key_key" ON "BackgroundJob"("key");
CREATE INDEX "BackgroundJob_state_runAt_idx" ON "BackgroundJob"("state", "runAt");
CREATE INDEX "BackgroundJob_state_lockedUntil_idx" ON "BackgroundJob"("state", "lockedUntil");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

CREATE TABLE "BackgroundWorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundWorkerHeartbeat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BackgroundWorkerHeartbeat_lastSeenAt_idx" ON "BackgroundWorkerHeartbeat"("lastSeenAt");

-- Preserve the old queue for rollback. The worker also imports late writes from
-- old API replicas and checks sentAt before sending an imported delivery.
INSERT INTO "BackgroundJob" ("id", "key", "type", "payload", "runAt", "createdAt", "updatedAt")
SELECT 'legacy-' || "id", 'ticket-email:' || "key", 'TICKET_EMAIL',
  jsonb_build_object('ticketIds', "ticketIds", 'legacyDeliveryId', "id"),
  GREATEST("nextAttemptAt", COALESCE("lockedUntil", "nextAttemptAt")), "createdAt", CURRENT_TIMESTAMP
FROM "TicketEmailDelivery" WHERE "sentAt" IS NULL
ON CONFLICT ("key") DO NOTHING;
