const assert = require("node:assert/strict");
const test = require("node:test");
const { once } = require("node:events");
const { Test } = require("@nestjs/testing");
const { APP_GUARD } = require("@nestjs/core");
const { ThrottlerGuard, ThrottlerModule } = require("@nestjs/throttler");
const { HealthController } = require("../dist/src/health/health.controller.js");
const { HealthService } = require("../dist/src/health/health.service.js");
const { RedisConnectionsService } = require("../dist/src/realtime/redis-connections.service.js");

test("health endpoints stay uncached and unthrottled and readiness returns HTTP 503", async () => {
  let ready = true;
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1 }])],
    controllers: [HealthController],
    providers: [
      { provide: HealthService, useValue: { isReady: async () => ready } },
      { provide: APP_GUARD, useClass: ThrottlerGuard }
    ]
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  try {
    const base = await app.getUrl();
    for (const path of ["", "/live", "/ready", "/ready"]) {
      const response = await fetch(`${base}/api/health${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).status, "ok");
    }
    ready = false;
    const response = await fetch(`${base}/api/health/ready`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "unavailable", service: "crushclub-api" });
    assert.equal((await fetch(`${base}/api/health/live`)).status, 200);
    ready = true;
    assert.equal((await fetch(`${base}/api/health/ready`)).status, 200);
  } finally { await app.close(); }
});

test("concurrent readiness requests share work and recover after dependency failure", async () => {
  let queries = 0;
  let ping = true;
  const health = new HealthService({ getOrThrow: () => "postgresql://unused@127.0.0.1/unused" }, { checkHealth: async () => ping });
  health.database.query = async () => { queries++; await new Promise((resolve) => setTimeout(resolve, 20)); return {}; };
  try {
    assert.ok((await Promise.all(Array.from({ length: 30 }, () => health.isReady()))).every(Boolean));
    assert.equal(queries, 1);
    await new Promise((resolve) => setTimeout(resolve, 260));
    ping = false;
    assert.equal(await health.isReady(), false);
    await new Promise((resolve) => setTimeout(resolve, 260));
    ping = true;
    assert.equal(await health.isReady(), true);
  } finally { await health.onModuleDestroy(); }
});

test("readiness probes real PostgreSQL and Redis, detects outages, and releases clients", {
  skip: !process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL
}, async () => {
  const config = { getOrThrow: (key) => key === "DATABASE_URL" ? process.env.TEST_DATABASE_URL : process.env.TEST_REDIS_URL };
  const redis = new RedisConnectionsService(config);
  const health = new HealthService(config, redis);
  try {
    await redis.connect();
    for (let attempt = 0; attempt < 40 && redis.probe.status !== "ready"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(await health.isReady(), true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    const disconnected = once(redis.publisher, "end");
    redis.publisher.disconnect();
    await disconnected;
    assert.equal(await health.isReady(), false, "a probe PING cannot hide a broken realtime publisher");
    await redis.publisher.connect();
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(await health.isReady(), true);

    const unavailable = new HealthService({ getOrThrow: () => "postgresql://unused@127.0.0.1:1/unused" }, redis);
    const started = performance.now();
    try {
      assert.equal(await unavailable.isReady(), false);
      assert.ok(performance.now() - started < 3000);
      assert.equal(unavailable.database.waitingCount, 0);
    } finally { await unavailable.onModuleDestroy(); }
    assert.equal(await health.isReady(), true);

    const slow = new HealthService(config, redis);
    const query = slow.database.query.bind(slow.database);
    slow.database.query = () => query("SELECT pg_sleep(10)");
    const slowStarted = performance.now();
    try {
      const results = await Promise.all(Array.from({ length: 20 }, () => slow.isReady()));
      assert.ok(results.every((ready) => ready === false));
      assert.ok(performance.now() - slowStarted < 3000, "real slow queries time out within the readiness budget");
      assert.equal(slow.database.waitingCount, 0, "concurrent failed probes leave no queued queries");
    } finally { await slow.onModuleDestroy(); }
  } finally {
    await health.onModuleDestroy();
    const ended = [redis.publisher, redis.subscriber, redis.probe]
      .filter((client) => client.status !== "end")
      .map((client) => once(client, "end"));
    redis.onModuleDestroy();
    await Promise.all(ended);
  }
  assert.equal(health.database.totalCount, 0);
  assert.ok([redis.publisher, redis.subscriber, redis.probe].every((client) => client.status === "end"));
});
