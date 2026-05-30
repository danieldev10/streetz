-- Make PostGIS trigger function schema-agnostic so it works on both
-- Supabase (PostGIS in "extensions" schema) and Railway/standard
-- PostgreSQL (PostGIS in "public" schema).
--
-- The function sets its own search_path to include both schemas,
-- so it resolves PostGIS functions regardless of where the extension
-- is installed.
CREATE OR REPLACE FUNCTION sync_profile_location_from_coordinates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
    NEW."location" := NULL;
  ELSE
    NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  END IF;

  RETURN NEW;
END;
$$;
