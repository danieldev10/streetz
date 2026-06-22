-- Backfill legacy category values that were introduced before the final category list.
-- "General" was removed from the UI because the All filter already covers that meaning.
UPDATE "Event"
SET "category" = 'Community'
WHERE "category" = 'General'
   OR btrim("category") = '';
