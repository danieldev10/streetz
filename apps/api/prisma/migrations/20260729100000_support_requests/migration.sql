CREATE TYPE "SupportRequestStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_USER',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE "SupportRequestCategory" AS ENUM (
  'ACCOUNT_LOGIN',
  'MEMBERSHIP_PAYMENT',
  'EVENTS_TICKETS',
  'GUEST_TICKETS',
  'RAFFLES',
  'PROFILE_VERIFICATION',
  'DISCOVERY_PRIVACY',
  'ROOMS_MESSAGES',
  'SAFETY_REPORT',
  'TECHNICAL',
  'OTHER'
);

CREATE TYPE "SupportPriority" AS ENUM (
  'NORMAL',
  'HIGH',
  'URGENT'
);

CREATE TYPE "SupportMessageAuthorType" AS ENUM (
  'USER',
  'GUEST',
  'ADMIN',
  'SYSTEM'
);

CREATE TABLE "SupportRequest" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "category" "SupportRequestCategory" NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "SupportRequestStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
  "manageTokenHash" TEXT NOT NULL,
  "manageTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "currentPage" TEXT,
  "userAgent" TEXT,
  "appVersion" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "authorType" "SupportMessageAuthorType" NOT NULL,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportRequest_reference_key" ON "SupportRequest"("reference");
CREATE UNIQUE INDEX "SupportRequest_manageTokenHash_key" ON "SupportRequest"("manageTokenHash");
CREATE INDEX "SupportRequest_userId_updatedAt_idx" ON "SupportRequest"("userId", "updatedAt");
CREATE INDEX "SupportRequest_status_priority_lastMessageAt_idx" ON "SupportRequest"("status", "priority", "lastMessageAt");
CREATE INDEX "SupportRequest_email_createdAt_idx" ON "SupportRequest"("email", "createdAt");
CREATE INDEX "SupportMessage_requestId_createdAt_idx" ON "SupportMessage"("requestId", "createdAt");

ALTER TABLE "SupportRequest"
  ADD CONSTRAINT "SupportRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
