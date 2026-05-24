DO $$
BEGIN
  CREATE TYPE "NotificationKind" AS ENUM ('ROOM_CREATED', 'EVENT_PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NotificationSeen" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "entityId" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationSeen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationSeen_userId_kind_entityId_key"
  ON "NotificationSeen"("userId", "kind", "entityId");
CREATE INDEX IF NOT EXISTS "NotificationSeen_userId_kind_idx"
  ON "NotificationSeen"("userId", "kind");

DO $$
BEGIN
  ALTER TABLE "NotificationSeen"
    ADD CONSTRAINT "NotificationSeen_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
