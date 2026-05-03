CREATE TYPE "ConnectionStatus" AS ENUM ('MEET_NOW', 'FWB', 'JUST_FRIENDS', 'DATING');

ALTER TABLE "Profile"
ADD COLUMN "connectionStatus" "ConnectionStatus";

CREATE INDEX "Profile_connectionStatus_idx" ON "Profile"("connectionStatus");
