CREATE TYPE "EventBookingAccess" AS ENUM ('MEMBERS_ONLY', 'PUBLIC');

ALTER TYPE "TicketStatus" ADD VALUE 'CONFIRMED' AFTER 'RESERVED';

ALTER TABLE "Event"
ADD COLUMN "bookingAccess" "EventBookingAccess" NOT NULL DEFAULT 'MEMBERS_ONLY';

CREATE TABLE "GuestTicketRequest" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "ticketTypeId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestTicketRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestTicketRequest_quantity_range" CHECK ("quantity" BETWEEN 1 AND 20),
  CONSTRAINT "GuestTicketRequest_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE TABLE "GuestTicketOrder" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "ticketTypeId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "manageTokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestTicketOrder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Ticket" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Ticket" ADD COLUMN "guestOrderId" TEXT;

ALTER TABLE "GuestTicketRequest"
ADD CONSTRAINT "GuestTicketRequest_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestTicketRequest"
ADD CONSTRAINT "GuestTicketRequest_ticketTypeId_fkey"
FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestTicketOrder"
ADD CONSTRAINT "GuestTicketOrder_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestTicketOrder"
ADD CONSTRAINT "GuestTicketOrder_ticketTypeId_fkey"
FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_guestOrderId_fkey"
FOREIGN KEY ("guestOrderId") REFERENCES "GuestTicketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_exactly_one_owner"
CHECK (("userId" IS NOT NULL AND "guestOrderId" IS NULL) OR ("userId" IS NULL AND "guestOrderId" IS NOT NULL));

CREATE UNIQUE INDEX "GuestTicketOrder_manageTokenHash_key" ON "GuestTicketOrder"("manageTokenHash");
CREATE INDEX "GuestTicketRequest_email_eventId_ticketTypeId_createdAt_idx" ON "GuestTicketRequest"("email", "eventId", "ticketTypeId", "createdAt");
CREATE INDEX "GuestTicketRequest_expiresAt_consumedAt_idx" ON "GuestTicketRequest"("expiresAt", "consumedAt");
CREATE INDEX "GuestTicketOrder_email_eventId_ticketTypeId_idx" ON "GuestTicketOrder"("email", "eventId", "ticketTypeId");
CREATE INDEX "GuestTicketOrder_eventId_createdAt_idx" ON "GuestTicketOrder"("eventId", "createdAt");
CREATE INDEX "Ticket_guestOrderId_status_idx" ON "Ticket"("guestOrderId", "status");

UPDATE "Event" AS event
SET "bookingAccess" = 'PUBLIC'
WHERE event."kind" = 'STANDARD'
  AND EXISTS (
    SELECT 1 FROM "TicketType" AS ticket_type
    WHERE ticket_type."eventId" = event."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "TicketType" AS ticket_type
    WHERE ticket_type."eventId" = event."id" AND ticket_type."priceKobo" > 0
  );
