-- Re-create the PostGIS GIST index on Profile.location.
-- Prisma cannot track indexes on Unsupported types, so it drops this index
-- during every migration. This script runs after migrations to restore it.
CREATE INDEX IF NOT EXISTS "Profile_location_gist_idx"
  ON "Profile"
  USING GIST ("location");
