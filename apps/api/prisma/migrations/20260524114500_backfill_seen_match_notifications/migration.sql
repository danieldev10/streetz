INSERT INTO "NotificationSeen" ("id", "userId", "kind", "entityId", "seenAt", "createdAt")
SELECT
  'legacy-match-created-' || md5("id" || ':' || "userAId"),
  "userAId",
  'MATCH_CREATED'::"NotificationKind",
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Match"
ON CONFLICT ("userId", "kind", "entityId") DO NOTHING;

INSERT INTO "NotificationSeen" ("id", "userId", "kind", "entityId", "seenAt", "createdAt")
SELECT
  'legacy-match-created-' || md5("id" || ':' || "userBId"),
  "userBId",
  'MATCH_CREATED'::"NotificationKind",
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Match"
ON CONFLICT ("userId", "kind", "entityId") DO NOTHING;
