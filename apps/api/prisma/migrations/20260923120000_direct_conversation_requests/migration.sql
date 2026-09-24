ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

ALTER TABLE "Match"
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Match"
SET "acceptedAt" = "createdAt"
WHERE "status" = 'ACTIVE' AND "acceptedAt" IS NULL;

ALTER TABLE "Match"
  ADD CONSTRAINT "Match_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Match_requestedById_status_createdAt_idx"
  ON "Match"("requestedById", "status", "createdAt");
