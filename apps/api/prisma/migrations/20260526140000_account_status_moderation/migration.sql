CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED', 'BANNED', 'DELETED');

CREATE TYPE "ModerationActionType" AS ENUM ('SUSPEND', 'BAN', 'RESTORE', 'DELETE', 'DEACTIVATE', 'REACTIVATE');

ALTER TABLE "User"
  ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedUntil" TIMESTAMP(3),
  ADD COLUMN "deactivatedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "moderationReason" TEXT;

CREATE TABLE "ModerationAction" (
  "id" TEXT NOT NULL,
  "adminId" TEXT,
  "targetUserId" TEXT,
  "reportId" TEXT,
  "action" "ModerationActionType" NOT NULL,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationAction_targetUserId_createdAt_idx" ON "ModerationAction"("targetUserId", "createdAt");
CREATE INDEX "ModerationAction_reportId_idx" ON "ModerationAction"("reportId");

ALTER TABLE "ModerationAction"
  ADD CONSTRAINT "ModerationAction_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationAction"
  ADD CONSTRAINT "ModerationAction_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationAction"
  ADD CONSTRAINT "ModerationAction_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "UserReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
