-- Nullable so historical duplicate orders remain intact; all newly confirmed
-- orders receive an event/email booking key and are database-enforced unique.
ALTER TABLE "GuestTicketOrder" ADD COLUMN "bookingKey" TEXT;
CREATE UNIQUE INDEX "GuestTicketOrder_bookingKey_key" ON "GuestTicketOrder"("bookingKey");
