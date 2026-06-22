UPDATE "TicketType"
SET "name" = 'Regular'
WHERE "name" = 'General Admission';

CREATE UNIQUE INDEX "TicketType_eventId_name_key" ON "TicketType"("eventId", "name");
