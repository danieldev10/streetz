-- CreateEnum
CREATE TYPE "FaceVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "FaceVerificationProvider" AS ENUM ('AWS_REKOGNITION');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "faceVerificationStatus" "FaceVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "faceVerificationVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "faceVerificationOverrideReason" TEXT;

-- CreateTable
CREATE TABLE "FaceVerificationAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "FaceVerificationProvider" NOT NULL DEFAULT 'AWS_REKOGNITION',
  "providerSessionId" TEXT,
  "status" "FaceVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "effectiveStatus" "FaceVerificationStatus",
  "livenessConfidence" DOUBLE PRECISION,
  "faceMatchSimilarity" DOUBLE PRECISION,
  "matchedPhotoId" TEXT,
  "referenceImageBucket" TEXT,
  "referenceImageKey" TEXT,
  "auditImagePrefix" TEXT,
  "failureReason" TEXT,
  "overrideReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FaceVerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FaceVerificationAttempt_providerSessionId_key" ON "FaceVerificationAttempt"("providerSessionId");

-- CreateIndex
CREATE INDEX "FaceVerificationAttempt_userId_createdAt_idx" ON "FaceVerificationAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FaceVerificationAttempt_status_createdAt_idx" ON "FaceVerificationAttempt"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "FaceVerificationAttempt"
  ADD CONSTRAINT "FaceVerificationAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
