ALTER TABLE "ChatRoom"
  ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT 'Nigeria',
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

CREATE INDEX IF NOT EXISTS "ChatRoom_isActive_updatedAt_idx" ON "ChatRoom"("isActive", "updatedAt");
CREATE INDEX IF NOT EXISTS "ChatRoom_createdById_idx" ON "ChatRoom"("createdById");

DO $$
BEGIN
  ALTER TABLE "ChatRoom"
    ADD CONSTRAINT "ChatRoom_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RoomMembership" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoomMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoomMembership_roomId_userId_key" ON "RoomMembership"("roomId", "userId");
CREATE INDEX IF NOT EXISTS "RoomMembership_userId_idx" ON "RoomMembership"("userId");

DO $$
BEGIN
  ALTER TABLE "RoomMembership"
    ADD CONSTRAINT "RoomMembership_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RoomMembership"
    ADD CONSTRAINT "RoomMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
