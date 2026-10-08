const assert = require("node:assert/strict");
const test = require("node:test");
const { Test } = require("@nestjs/testing");
const { ConfigService } = require("@nestjs/config");
const { WorkerHealthController } = require("../dist/src/jobs/worker-health.controller.js");
const { BackgroundWorkerService } = require("../dist/src/jobs/background-worker.service.js");

test("worker HTTP exposes only health, detects stalled processing, and bounds slow DB probes", {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  let workerReady = true;
  const module = await Test.createTestingModule({
    controllers: [WorkerHealthController],
    providers: [
      { provide: ConfigService, useValue: { getOrThrow: () => process.env.TEST_DATABASE_URL } },
      { provide: BackgroundWorkerService, useValue: { ready: () => workerReady } }
    ]
  }).compile();
  const app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  const health = app.get(WorkerHealthController);
  const base = await app.getUrl();
  try {
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
    assert.equal((await fetch(`${base}/api/public/events`)).status, 404);
    assert.equal((await fetch(`${base}/socket.io/?EIO=4&transport=polling`)).status, 404);
    workerReady = false;
    const failed = await fetch(`${base}/health/ready`);
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { status: "unavailable" });
    assert.equal(failed.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
    workerReady = true;
    const original = health.database.query.bind(health.database);
    health.database.query = () => original("SELECT pg_sleep(10)");
    const started = Date.now();
    const probes = await Promise.all(Array.from({ length: 15 }, () => fetch(`${base}/health/ready`)));
    assert.ok(probes.every((response) => response.status === 503));
    assert.ok(Date.now() - started < 3000);
    assert.equal(health.database.waitingCount, 0);
    health.database.query = original;
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
  } finally { await app.close(); }
  assert.equal(health.database.totalCount, 0);
});
