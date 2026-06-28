-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('STANDARD', 'RAFFLE');

-- CreateEnum
CREATE TYPE "RaffleStatus" AS ENUM ('SCHEDULED', 'SELLING', 'SALES_CLOSED', 'DRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RaffleEntryStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "kind" "EventKind" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "RaffleDraw" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketPriceKobo" INTEGER NOT NULL,
    "salesStartsAt" TIMESTAMP(3) NOT NULL,
    "salesEndsAt" TIMESTAMP(3) NOT NULL,
    "drawsAt" TIMESTAMP(3) NOT NULL,
    "prizeTitle" TEXT NOT NULL,
    "prizeDescription" TEXT,
    "prizeImage" TEXT,
    "prizeCategory" TEXT,
    "prizeEstimatedValueKobo" INTEGER,
    "status" "RaffleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "nextEntryNumber" INTEGER NOT NULL DEFAULT 1,
    "winnerEntryId" TEXT,
    "winnerUserId" TEXT,
    "drawnAt" TIMESTAMP(3),
    "drawnByAdminId" TEXT,
    "drawSeed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleEntry" (
    "id" TEXT NOT NULL,
    "raffleDrawId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "RaffleEntryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaffleDraw_eventId_key" ON "RaffleDraw"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleDraw_winnerEntryId_key" ON "RaffleDraw"("winnerEntryId");

-- CreateIndex
CREATE INDEX "RaffleDraw_status_salesEndsAt_idx" ON "RaffleDraw"("status", "salesEndsAt");

-- CreateIndex
CREATE INDEX "RaffleDraw_status_drawsAt_idx" ON "RaffleDraw"("status", "drawsAt");

-- CreateIndex
CREATE INDEX "RaffleEntry_raffleDrawId_status_idx" ON "RaffleEntry"("raffleDrawId", "status");

-- CreateIndex
CREATE INDEX "RaffleEntry_userId_idx" ON "RaffleEntry"("userId");

-- CreateIndex
CREATE INDEX "RaffleEntry_paymentId_idx" ON "RaffleEntry"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleEntry_raffleDrawId_number_key" ON "RaffleEntry"("raffleDrawId", "number");

-- CreateIndex
CREATE INDEX "Event_kind_status_startsAt_idx" ON "Event"("kind", "status", "startsAt");

-- AddForeignKey
ALTER TABLE "RaffleDraw" ADD CONSTRAINT "RaffleDraw_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleDraw" ADD CONSTRAINT "RaffleDraw_winnerEntryId_fkey" FOREIGN KEY ("winnerEntryId") REFERENCES "RaffleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_raffleDrawId_fkey" FOREIGN KEY ("raffleDrawId") REFERENCES "RaffleDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
