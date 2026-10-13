const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { EventEmitter, once } = require("node:events");
const { ConfigService } = require("@nestjs/config");
const { JwtService } = require("@nestjs/jwt");
const { Test } = require("@nestjs/testing");
const { APP_GUARD } = require("@nestjs/core");
const { ThrottlerModule } = require("@nestjs/throttler");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { hash } = require("bcryptjs");
const { browserOrigins } = require("../dist/src/auth/browser-origins.js");
const { BrowserOriginGuard } = require("../dist/src/auth/guards/browser-origin.guard.js");
const { AuthService } = require("../dist/src/auth/auth.service.js");
const { AuthController } = require("../dist/src/auth/auth.controller.js");
const { RealtimeAuthService } = require("../dist/src/auth/realtime-auth.service.js");
const { RedisRateLimitStore } = require("../dist/src/abuse/redis-rate-limit.store.js");
const { SharedThrottleGuard } = require("../dist/src/abuse/shared-throttle.guard.js");
const { HealthService } = require("../dist/src/health/health.service.js");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const context = (headers) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) });
function config(extra = {}) {
  const values = { WEB_APP_URL: "https://site.example.test", JWT_ACCESS_SECRET: "test-access-" + randomUUID(),
    JWT_REFRESH_SECRET: "test-refresh-" + randomUUID(), REDIS_URL: process.env.TEST_REDIS_URL,
    DATABASE_URL: process.env.TEST_DATABASE_URL, ...extra };
  return { get: (key, fallback) => values[key] ?? fallback, getOrThrow: (key) => {
    if (!values[key]) throw new Error("Missing test config: " + key);
    return values[key];
  }};
}
async function startRates(configuration) {
  const store = new RedisRateLimitStore(configuration);
  store.onModuleInit();
  for (let i = 0; i < 80 && !store.isReady(); i++) await delay(25);
  assert.equal(store.isReady(), true, "disposable Redis must be reachable");
  return store;
}

test("cookie authentication accepts exact trusted origins and rejects forged, null, missing or simple form sources", () => {
  const guard = new BrowserOriginGuard(config({ AUTH_ALLOWED_ORIGINS: "https://alias.example.test" }));
  assert.equal(guard.canActivate(context({ origin: "https://site.example.test", "x-crushclub-client": "web" })), true);
  assert.equal(guard.canActivate(context({ origin: "https://alias.example.test", "content-type": "application/json; charset=utf-8" })), true);
  assert.equal(guard.canActivate(context({ referer: "https://site.example.test/reset?token=private", "x-crushclub-client": "web" })), true);
  for (const headers of [
    { origin: "https://evil.test", "x-crushclub-client": "web" },
    { origin: "https://site.example.test.evil.test", "x-crushclub-client": "web" },
    { origin: "null", referer: "https://site.example.test/", "x-crushclub-client": "web" },
    { "x-crushclub-client": "web" },
    { origin: "https://site.example.test", "content-type": "text/plain" },
    { origin: "https://site.example.test", "x-crushclub-client": "wrong", "content-type": "application/json" },
    { origin: ["https://site.example.test"], "x-crushclub-client": "web" },
  ]) assert.throws(() => guard.canActivate(context(headers)), (error) => error.getStatus() === 403);
  assert.deepEqual(browserOrigins("https://site.example.test/", "https://site.example.test,http://localhost:3000"), ["https://site.example.test", "http://localhost:3000"]);
  for (const value of ["https://*.example.test", "https://site.example.test/path", "https://user:password@site.example.test", "https://site.example.test?x=1", "*"]) {
    assert.throws(() => browserOrigins(value));
  }
});

test("Redis counters are atomic across replicas, blocks expire without extension, and outages fail closed then recover", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const configuration = config(), first = await startRates(configuration), second = await startRates(configuration);
  try {
    const key = "private-email@example.test";
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? first : second).increment(key, 1000, 10, 600, "replica-test")));
    assert.equal(results.filter((result) => !result.isBlocked).length, 10);
    const keys = await first.redis.keys("crushclub:rate:v1:*");
    assert.ok(keys.every((value) => !value.includes(key)));
    assert.equal(first.identifier(key), second.identifier(key));
    const prefix = "crushclub:rate:v1:{" + first.identifier("replica-test:" + key) + "}";
    const before = await first.redis.pttl(prefix + ":block");
    await delay(40);
    await second.increment(key, 1000, 10, 600, "replica-test");
    const after = await first.redis.pttl(prefix + ":block");
    assert.ok(after < before, "blocked attempts must not extend the block");
    await delay(650);
    assert.equal((await first.increment(key, 1000, 10, 600, "replica-test")).totalHits, 1);
    const health = new HealthService(configuration, { checkHealth: async () => true }, first);
    health.database.query = async () => ({});
    try {
      assert.equal(await health.isReady(), true);
      const ping = first.redis.ping.bind(first.redis);
      first.redis.ping = async () => { throw new Error("temporary probe timeout"); };
      await delay(260);
      assert.equal(await health.isReady(), false, "ready connection state cannot hide a failed protection PING");
      first.redis.ping = ping;
      await delay(260);
      assert.equal(await health.isReady(), true);
      const ended = once(first.redis, "end"); first.redis.disconnect(); await ended;
      const started = performance.now();
      await assert.rejects(first.increment(key, 1000, 10, 600, "replica-test"), (error) => error.getStatus() === 503);
      assert.ok(performance.now() - started < 1500);
      await delay(260);
      assert.equal(await health.isReady(), false, "a broken protection connection must make readiness fail");
      await first.redis.connect();
      await delay(260);
      assert.equal(await health.isReady(), true);
      assert.equal((await first.increment(key, 1000, 10, 600, "replica-test")).isBlocked, false);
    } finally { await health.onModuleDestroy(); }
    await first.redis.del(prefix, prefix + ":block");
  } finally { first.onModuleDestroy(); second.onModuleDestroy(); }
});

test("two HTTP replicas share login limits and real database cookie rotation/logout", {
  skip: !process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL
}, async (t) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const configuration = config(), rates = await startRates(configuration), apps = [];
  const email = "auth-" + randomUUID() + "@example.test";
  const user = await prisma.user.create({ data: { email, displayName: "Auth test", passwordHash: await hash("safe-fixture-password", 4) } });
  const users = { findByEmail: (value) => prisma.user.findUnique({ where: { email: value } }) };
  const auth = new AuthService(users, prisma, {}, new JwtService(), configuration);
  const oldNodeEnv = process.env.NODE_ENV, oldSameSite = process.env.REFRESH_COOKIE_SAME_SITE;
  process.env.NODE_ENV = "production"; delete process.env.REFRESH_COOKIE_SAME_SITE;
  const make = async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 120 }], storage: rates })],
      controllers: [AuthController], providers: [
        { provide: AuthService, useValue: auth }, { provide: ConfigService, useValue: configuration },
        BrowserOriginGuard, { provide: APP_GUARD, useClass: SharedThrottleGuard },
      ],
    }).compile();
    const app = module.createNestApplication({ logger: false });
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    apps.push(app);
    return await app.getUrl();
  };
  try {
    const [one, two] = await Promise.all([make(), make()]);
    let ip = 0;
    const request = (base, path, body, cookie, overrides = {}) => fetch(base + "/api/auth/" + path, {
      method: "POST", headers: { origin: "https://site.example.test", "content-type": "application/json",
        "x-crushclub-client": "web", "x-forwarded-for": "192.0.2." + (++ip),
        ...(cookie ? { cookie } : {}), ...overrides }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const cookieFrom = (response) => response.headers.get("set-cookie").split(";")[0];
    await t.test("secure HTTP-only cookie, private responses and atomic refresh rotation", async () => {
      const login = await request(one, "login", { email, password: "safe-fixture-password" });
      assert.equal(login.status, 201);
      assert.equal(login.headers.get("cache-control"), "no-store");
      const body = await login.json();
      assert.ok(body.accessToken);
      assert.equal(body.refreshToken, undefined);
      const header = login.headers.get("set-cookie");
      for (const value of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/api/auth"]) assert.ok(header.includes(value), value);
      const originalCookie = cookieFrom(login);
      const race = await Promise.all([request(one, "refresh", null, originalCookie), request(two, "refresh", null, originalCookie)]);
      assert.deepEqual(race.map((response) => response.status).sort(), [201, 401]);
      const winner = race.find((response) => response.status === 201);
      const nextCookie = cookieFrom(winner);
      assert.notEqual(nextCookie, originalCookie);
      const refreshed = await request(two, "refresh", null, nextCookie);
      assert.equal(refreshed.status, 201);
      const finalCookie = cookieFrom(refreshed);
      const logout = await request(one, "logout", null, finalCookie);
      assert.equal(logout.status, 201);
      assert.ok(logout.headers.get("set-cookie").includes("Expires=Thu, 01 Jan 1970"));
      assert.equal((await request(two, "refresh", null, finalCookie)).status, 401);
      const token = await prisma.refreshToken.findFirst({ where: { userId: user.id, revokedAt: null } });
      assert.equal(token, null);
    });
    await t.test("per-account login budgets hold across changing IP addresses and replicas", async () => {
      const targetEmail = "unknown-" + randomUUID() + "@example.test";
      for (let i = 0; i < 15; i++) {
        const response = await request(i % 2 ? one : two, "login", { email: i % 2 ? targetEmail.toUpperCase() : targetEmail, password: "wrong" });
        assert.equal(response.status, 401);
      }
      const limited = await request(two, "login", { email: targetEmail, password: "wrong" });
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
    });
    await t.test("default and decorator IP limits are shared between replicas", async () => {
      for (let i = 0; i < 5; i++) {
        const response = await request(i % 2 ? one : two, "login", { email: "distinct-" + i + "@example.test", password: "wrong" }, null, { "x-forwarded-for": "198.51.100.1" });
        assert.equal(response.status, 401);
      }
      const limited = await request(two, "login", { email: "distinct-last@example.test", password: "wrong" }, null, { "x-forwarded-for": "198.51.100.1" });
      assert.equal(limited.status, 429);
    });
    await t.test("origin guard runs on real cookie routes before auth can mutate the session", async () => {
      assert.equal((await request(one, "login", { email, password: "safe-fixture-password" }, null, { origin: "https://evil.test" })).status, 403);
      assert.equal((await request(one, "logout", null, null, { origin: "null" })).status, 403);
      const before = await prisma.refreshToken.count({ where: { userId: user.id } });
      assert.equal((await request(one, "login", { email, password: "safe-fixture-password" }, null, { origin: "https://site.example.test.evil.test" })).status, 403);
      assert.equal(await prisma.refreshToken.count({ where: { userId: user.id } }), before);
    });
  } finally {
    await Promise.all(apps.map((app) => app.close()));
    rates.onModuleDestroy();
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldSameSite === undefined) delete process.env.REFRESH_COOKIE_SAME_SITE; else process.env.REFRESH_COOKIE_SAME_SITE = oldSameSite;
  }
});

test("realtime sockets expire, reject expired actions and share per-user action limits", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const configuration = config(), first = await startRates(configuration), second = await startRates(configuration);
  const jwt = new JwtService();
  const user = { id: "socket-" + randomUUID(), email: "socket@example.test", role: "USER", accountStatus: "ACTIVE", suspendedUntil: null };
  const prisma = { user: { findUnique: async () => user } };
  const one = new RealtimeAuthService(jwt, configuration, prisma, first), two = new RealtimeAuthService(jwt, configuration, prisma, second);
  const socket = () => {
    const client = new EventEmitter();
    client.data = {};
    client.handshake = { auth: { token: jwt.sign({ sub: user.id }, { secret: configuration.getOrThrow("JWT_ACCESS_SECRET"), expiresIn: 1 }) }, headers: {} };
    client.disconnect = () => { client.disconnected = true; client.emit("disconnect", "server"); };
    return client;
  };
  const a = socket(), b = socket();
  try {
    a.data.user = await one.authenticate(a); b.data.user = await two.authenticate(b);
    // Give the action-budget test a long enough local fixture expiry; the
    // separate timer test below exercises a real signed short-lived JWT.
    a.data.authExpiresAt = b.data.authExpiresAt = Date.now() + 60000;
    for (let i = 0; i < 30; i++) await (i % 2 ? one : two).authorizeAction(i % 2 ? a : b, "send");
    await assert.rejects(two.authorizeAction(b, "send"), /Too many realtime actions/);
    a.data.authExpiresAt = Date.now() - 1;
    await assert.rejects(one.authorizeAction(a, "join"), /refresh your session/);
    assert.equal(a.disconnected, true);
    const expiry = socket();
    const expired = once(expiry, "auth:expired");
    expiry.data.user = await one.authenticate(expiry);
    await expired;
    assert.equal(expiry.disconnected, true);
    b.disconnect();
    const invalid = socket(); invalid.handshake.auth.token = "invalid";
    await assert.rejects(one.authenticate(invalid), /Invalid or expired/);
  } finally { a.disconnect(); b.disconnect(); first.onModuleDestroy(); second.onModuleDestroy(); }
});
