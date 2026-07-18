DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'lastActiveAt'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'lastDiscoveryActiveAt'
  ) THEN
    ALTER TABLE "User" RENAME COLUMN "lastActiveAt" TO "lastDiscoveryActiveAt";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."User_lastActiveAt_idx"') IS NOT NULL
    AND to_regclass('public."User_lastDiscoveryActiveAt_idx"') IS NULL THEN
    ALTER INDEX "User_lastActiveAt_idx" RENAME TO "User_lastDiscoveryActiveAt_idx";
  END IF;
END $$;
