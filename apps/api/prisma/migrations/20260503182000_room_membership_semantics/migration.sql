DELETE FROM "RoomMembership" membership
USING "User" app_user
WHERE membership."userId" = app_user."id"
  AND app_user."role" = 'ADMIN';
