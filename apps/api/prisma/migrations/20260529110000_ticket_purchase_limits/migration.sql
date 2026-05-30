ALTER TABLE "TicketType"
ADD COLUMN "maxTicketsPerUser" INTEGER NOT NULL DEFAULT 4;

UPDATE "TicketType"
SET "maxTicketsPerUser" = LEAST("capacity", 4);
