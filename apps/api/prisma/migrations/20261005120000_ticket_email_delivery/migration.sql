CREATE TABLE "TicketEmailDelivery" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "ticketIds" TEXT[],
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketEmailDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TicketEmailDelivery_key_key" ON "TicketEmailDelivery"("key");
CREATE INDEX "TicketEmailDelivery_sentAt_nextAttemptAt_idx" ON "TicketEmailDelivery"("sentAt", "nextAttemptAt");
