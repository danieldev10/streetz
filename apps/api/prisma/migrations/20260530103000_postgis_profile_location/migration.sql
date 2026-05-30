CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

UPDATE "Profile"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
WHERE "latitude" IS NOT NULL
  AND "longitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Profile_location_gist_idx"
  ON "Profile"
  USING GIST ("location");

CREATE OR REPLACE FUNCTION sync_profile_location_from_coordinates()
RETURNS trigger AS $$
BEGIN
  IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
    NEW."location" := NULL;
  ELSE
    NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::geography;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Profile_sync_location_from_coordinates" ON "Profile";

CREATE TRIGGER "Profile_sync_location_from_coordinates"
BEFORE INSERT OR UPDATE OF "latitude", "longitude"
ON "Profile"
FOR EACH ROW
EXECUTE FUNCTION sync_profile_location_from_coordinates();
