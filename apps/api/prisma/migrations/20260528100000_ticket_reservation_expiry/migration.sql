ALTER TABLE "Ticket"
  ADD COLUMN "reservedUntil" TIMESTAMP(3);

UPDATE "Ticket"
SET "reservedUntil" = "createdAt" + INTERVAL '15 minutes'
WHERE "status" = 'RESERVED'
  AND "reservedUntil" IS NULL;

CREATE INDEX "Ticket_status_reservedUntil_idx" ON "Ticket"("status", "reservedUntil");
CREATE INDEX "Ticket_ticketTypeId_status_reservedUntil_idx" ON "Ticket"("ticketTypeId", "status", "reservedUntil");
