const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { Test } = require("@nestjs/testing");
const { ConfigService } = require("@nestjs/config");
const { ValidationPipe } = require("@nestjs/common");
const { JwtService } = require("@nestjs/jwt");
const { APP_GUARD } = require("@nestjs/core");
const { ThrottlerGuard, ThrottlerModule } = require("@nestjs/throttler");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { PrismaService } = require("../dist/src/prisma/prisma.service.js");
const { JwtStrategy } = require("../dist/src/auth/strategies/jwt.strategy.js");
const { TrafficModule } = require("../dist/src/analytics/traffic.module.js");
const { TrafficService } = require("../dist/src/analytics/traffic.service.js");
const { JobQueueService } = require("../dist/src/jobs/job-queue.service.js");

test("traffic HTTP validates input/origin/auth, derives audience and excludes admins/bots", async () => {
  const calls = [], secret = randomUUID(), jwt = new JwtService();
  const config = { get: () => undefined, getOrThrow: (key) => key === "WEB_APP_URL" ? "https://crushclub.ng" : secret };
  const service = { record: async (...args) => { calls.push(args); }, totals: async (period) => ({ period }) };
  const module = await Test.createTestingModule({ imports: [TrafficModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])], providers: [
    JwtStrategy, { provide: ConfigService, useValue: config },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ] }).overrideProvider(TrafficService).useValue(service)
    .useMocker((token) => token === ConfigService ? config : token === PrismaService ? { user: { findUnique: async ({ where }) => ({ role: where.id === "admin" ? "ADMIN" : "USER", accountStatus: "ACTIVE" }) } } : undefined)
    .compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl(), payload = { eventId: randomUUID(), visitId: randomUUID(), pageKind: "LANDING" };
  const auth = (id) => ({ authorization: "Bearer " + jwt.sign({ sub: id, role: id === "admin" ? "ADMIN" : "USER" }, { secret, expiresIn: "1h" }) });
  const send = (body = payload, headers = {}) => fetch(base + "/analytics/page-view", { method: "POST", headers: { origin: "https://crushclub.ng", "content-type": "application/json", "user-agent": "Website browser", ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await send()).status, 204);
    assert.equal(calls[0][1], false);
    assert.equal((await send(payload, auth("member"))).status, 204);
    assert.equal(calls[1][1], true);
    assert.equal((await send(payload, auth("admin"))).status, 204);
    assert.equal((await send(payload, { "user-agent": "Googlebot" })).status, 204);
    assert.equal(calls.length, 2);
    assert.equal((await send(payload, { origin: "https://evil.test" })).status, 403);
    assert.equal((await send(payload, { authorization: "Bearer invalid" })).status, 401);
    for (const body of [{ ...payload, eventId: "invalid" }, { ...payload, audience: "member" }, { ...payload, url: "/profile?secret=value" }, { ...payload, pageKind: "arbitrary" }]) assert.equal((await send(body)).status, 400);
    assert.equal((await fetch(base + "/admin/traffic")).status, 401);
    assert.equal((await fetch(base + "/admin/traffic", { headers: auth("member") })).status, 403);
    const admin = await fetch(base + "/admin/traffic?period=7d", { headers: auth("admin") });
    assert.equal(admin.status, 200);
    assert.deepEqual(await admin.json(), { period: "7d" });
    assert.equal((await fetch(base + "/admin/traffic?period=invalid", { headers: auth("admin") })).status, 400);
    let limited = false;
    for (let i = 0; i < 61; i++) if ((await send()).status === 429) { limited = true; break; }
    assert.equal(limited, true);
  } finally { await app.close(); }
});

test("traffic DB handles replicas/retries atomically, WAT periods and dedup retention", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = "traffic_" + randomUUID().replaceAll("-", "");
  const make = (options) => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, options }) });
  const admin = make(), one = make(`-c search_path=${schema} -c TimeZone=Pacific/Honolulu`), two = make(`-c search_path=${schema}`);
  const service = new TrafficService(one), replica = new TrafficService(two);
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const migration = readFileSync(require.resolve("../prisma/migrations/20261024120000_website_traffic/migration.sql"), "utf8");
    for (const statement of migration.split(";").filter((part) => part.trim())) await one.$executeRawUnsafe(statement);
    assert.equal((await service.totals()).trackedSince, null);
    const visitId = randomUUID(), original = { visitId, eventId: randomUUID(), pageKind: "LANDING" };
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? service : replica).record(original, false)));
    await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? service : replica).record({ eventId: randomUUID(), visitId, pageKind: "OTHER" }, Boolean(i % 2))));
    await replica.record({ eventId: randomUUID(), visitId: randomUUID(), pageKind: "LOGIN" }, false);
    const today = await service.totals("today");
    assert.deepEqual(Object.fromEntries(["visits", "pageViews", "landingViews", "guestViews", "loginViews", "memberViews"].map((key) => [key, today[key]])), { visits: 2, pageViews: 42, landingViews: 1, guestViews: 22, loginViews: 1, memberViews: 20 });
    assert.ok(Math.abs(Date.now() - Date.parse(today.trackedSince)) < 10000);
    const [day] = await one.$queryRaw`SELECT day::text AS day FROM "WebsiteTrafficDay"`;
    const expectedDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    assert.equal(day.day, expectedDay);
    await one.$executeRaw`INSERT INTO "WebsiteTrafficDay" (day, visits, "pageViews", "guestViews", "firstSeenAt") VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date - 6, 3, 10, 10, (NOW() AT TIME ZONE 'UTC') - INTERVAL '6 days'), ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date - 29, 4, 20, 20, (NOW() AT TIME ZONE 'UTC') - INTERVAL '29 days'), ((CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date - 30, 5, 30, 30, (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days')`;
    assert.equal((await service.totals("7d")).pageViews, 52);
    assert.equal((await service.totals("30d")).pageViews, 72);
    assert.equal((await service.totals("all")).pageViews, 102);
    assert.equal((await service.totals("today")).trackedSince, (await service.totals("all")).trackedSince);
    const oldId = randomUUID();
    await one.$executeRaw`INSERT INTO "WebsitePageViewDedup" (id, "createdAt") VALUES (${oldId}::uuid, (NOW() AT TIME ZONE 'UTC') - INTERVAL '8 days')`;
    await one.$executeRaw`INSERT INTO "WebsiteVisitDedup" (id, "createdAt") VALUES (${oldId}::uuid, (NOW() AT TIME ZONE 'UTC') - INTERVAL '8 days')`;
    await new JobQueueService(one).cleanupTraffic();
    assert.equal((await one.$queryRaw`SELECT COUNT(*) AS count FROM "WebsitePageViewDedup" WHERE id = ${oldId}::uuid`)[0].count, 0n);
    assert.equal((await one.$queryRaw`SELECT COUNT(*) AS count FROM "WebsiteVisitDedup" WHERE id = ${oldId}::uuid`)[0].count, 0n);
    assert.equal((await service.totals()).pageViews, 102, "expiry preserves aggregate totals");
    await replica.record(original, false);
    assert.equal((await service.totals()).pageViews, 102, "recent dedup keys survive maintenance");
  } finally {
    await Promise.all([one.$disconnect(), two.$disconnect()]);
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
