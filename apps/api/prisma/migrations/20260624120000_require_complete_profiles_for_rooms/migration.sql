-- Room members must have the same completed profile fields required for discovery,
-- but room access does not require face verification.
DELETE FROM "RoomMembership" membership
WHERE NOT EXISTS (
  SELECT 1
  FROM "User" "user"
  JOIN "Profile" profile ON profile."userId" = "user"."id"
  WHERE "user"."id" = membership."userId"
    AND NULLIF(btrim(COALESCE(profile."bio", '')), '') IS NOT NULL
    AND profile."birthDate" IS NOT NULL
    AND profile."connectionStatus" IS NOT NULL
    AND NULLIF(btrim(COALESCE(profile."city", '')), '') IS NOT NULL
    AND NULLIF(btrim(COALESCE(profile."state", '')), '') IS NOT NULL
    AND cardinality(profile."interests") > 0
    AND EXISTS (
      SELECT 1
      FROM "ProfilePhoto" photo
      WHERE photo."userId" = "user"."id"
    )
);
