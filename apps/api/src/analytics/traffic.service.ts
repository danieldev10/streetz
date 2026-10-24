import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PageViewDto, TrafficPeriod } from "./traffic.dto";

type Totals = { visits: bigint; pageViews: bigint; landingViews: bigint; guestViews: bigint; loginViews: bigint; memberViews: bigint };

@Injectable()
export class TrafficService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: PageViewDto, member: boolean) {
    // A single atomic statement deduplicates retries and shared browser visits,
    // including simultaneous requests landing on different API replicas.
    await this.prisma.$executeRaw`
      WITH accepted AS (
        INSERT INTO "WebsitePageViewDedup" (id, "createdAt") VALUES (${input.eventId}::uuid, NOW() AT TIME ZONE 'UTC')
        ON CONFLICT DO NOTHING RETURNING id
      ), new_visit AS (
        INSERT INTO "WebsiteVisitDedup" (id, "createdAt") SELECT ${input.visitId}::uuid, NOW() AT TIME ZONE 'UTC' FROM accepted
        ON CONFLICT DO NOTHING RETURNING id
      )
      INSERT INTO "WebsiteTrafficDay" (day, visits, "pageViews", "landingViews", "guestViews", "loginViews", "memberViews", "firstSeenAt")
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date,
        (SELECT COUNT(*)::integer FROM new_visit), 1, ${input.pageKind === "LANDING" ? 1 : 0},
        ${member ? 0 : 1}, ${input.pageKind === "LOGIN" ? 1 : 0}, ${member ? 1 : 0}, NOW() AT TIME ZONE 'UTC'
      FROM accepted
      ON CONFLICT (day) DO UPDATE SET
        visits = "WebsiteTrafficDay".visits + EXCLUDED.visits,
        "pageViews" = "WebsiteTrafficDay"."pageViews" + EXCLUDED."pageViews",
        "landingViews" = "WebsiteTrafficDay"."landingViews" + EXCLUDED."landingViews",
        "guestViews" = "WebsiteTrafficDay"."guestViews" + EXCLUDED."guestViews",
        "loginViews" = "WebsiteTrafficDay"."loginViews" + EXCLUDED."loginViews",
        "memberViews" = "WebsiteTrafficDay"."memberViews" + EXCLUDED."memberViews"`;
  }

  async totals(period: TrafficPeriod = "all") {
    const days = { all: 0, today: 1, "7d": 7, "30d": 30 }[period];
    const [row] = await this.prisma.$queryRaw<(Totals & { trackedSince: Date | null })[]>`
      SELECT COALESCE(SUM(visits), 0) AS visits, COALESCE(SUM("pageViews"), 0) AS "pageViews",
        COALESCE(SUM("landingViews"), 0) AS "landingViews", COALESCE(SUM("guestViews"), 0) AS "guestViews",
        COALESCE(SUM("loginViews"), 0) AS "loginViews", COALESCE(SUM("memberViews"), 0) AS "memberViews",
        (SELECT MIN("firstSeenAt") FROM "WebsiteTrafficDay") AS "trackedSince"
      FROM "WebsiteTrafficDay"
      ${days ? Prisma.sql`WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date - ${days - 1}::integer` : Prisma.empty}`;
    const totals = Object.fromEntries(
      (["visits", "pageViews", "landingViews", "guestViews", "loginViews", "memberViews"] as const).map((key) => {
        const value = Number(row[key]);
        if (!Number.isSafeInteger(value)) throw new Error("Traffic total exceeds the supported count.");
        return [key, value];
      }),
    );
    return { ...totals, period, timezone: "Africa/Lagos", trackedSince: row.trackedSince?.toISOString() ?? null };
  }
}
