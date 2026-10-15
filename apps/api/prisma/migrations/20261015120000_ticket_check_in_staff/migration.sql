CREATE TABLE "EventCheckInStaff" (
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedById" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCheckInStaff_pkey" PRIMARY KEY ("eventId", "userId"),
  CONSTRAINT "EventCheckInStaff_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventCheckInStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventCheckInStaff_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "EventCheckInStaff_userId_assignedAt_idx" ON "EventCheckInStaff"("userId", "assignedAt");
ALTER TABLE "Ticket" ADD COLUMN "checkedInById" TEXT;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
