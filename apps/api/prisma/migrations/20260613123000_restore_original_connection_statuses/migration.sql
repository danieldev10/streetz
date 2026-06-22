UPDATE "Profile"
SET "connectionStatus" = CASE
  WHEN "connectionStatus" IN ('SERIOUS_RELATIONSHIP', 'CASUAL_DATING', 'OPEN_TO_ANYTHING') THEN 'DATING'::"ConnectionStatus"
  WHEN "connectionStatus" IN ('FRIENDS_FIRST', 'EVENT_BUDDY', 'CHAT_FIRST') THEN 'JUST_FRIENDS'::"ConnectionStatus"
  WHEN "connectionStatus" = 'SEX' THEN 'FWB'::"ConnectionStatus"
  ELSE "connectionStatus"
END
WHERE "connectionStatus" IN (
  'SERIOUS_RELATIONSHIP',
  'CASUAL_DATING',
  'FRIENDS_FIRST',
  'OPEN_TO_ANYTHING',
  'EVENT_BUDDY',
  'CHAT_FIRST',
  'SEX'
);

ALTER TYPE "ConnectionStatus" RENAME TO "ConnectionStatus_old";

CREATE TYPE "ConnectionStatus" AS ENUM ('MEET_NOW', 'FWB', 'JUST_FRIENDS', 'DATING');

ALTER TABLE "Profile"
ALTER COLUMN "connectionStatus" TYPE "ConnectionStatus"
USING "connectionStatus"::text::"ConnectionStatus";

DROP TYPE "ConnectionStatus_old";
