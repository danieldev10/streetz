CREATE TABLE "WebsiteTrafficDay" (
  "day" DATE NOT NULL PRIMARY KEY,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "pageViews" INTEGER NOT NULL DEFAULT 0,
  "landingViews" INTEGER NOT NULL DEFAULT 0,
  "guestViews" INTEGER NOT NULL DEFAULT 0,
  "loginViews" INTEGER NOT NULL DEFAULT 0,
  "memberViews" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "WebsitePageViewDedup" (
  "id" UUID NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WebsitePageViewDedup_createdAt_idx" ON "WebsitePageViewDedup" ("createdAt");
CREATE TABLE "WebsiteVisitDedup" (
  "id" UUID NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WebsiteVisitDedup_createdAt_idx" ON "WebsiteVisitDedup" ("createdAt");
