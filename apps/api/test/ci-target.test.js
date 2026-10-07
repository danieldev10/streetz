const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("CI targets reject missing configuration and remote/incorrect databases before migrations", async () => {
  const { getTestTargets } = await import("../scripts/ci/target.mjs");
  const base = { CI_TEST_DATABASE: "true", TEST_DATABASE_URL: "postgresql://test@127.0.0.1:55439/crushclub_ci?schema=public", TEST_REDIS_URL: "redis://127.0.0.1:16389" };
  for (const overrides of [
    { CI_TEST_DATABASE: undefined }, { TEST_DATABASE_URL: undefined },
    { TEST_DATABASE_URL: "postgresql://test@db.example.com/crushclub_ci" },
    { TEST_DATABASE_URL: "postgresql://test@127.0.0.1/streetz" },
    { TEST_DATABASE_URL: "postgresql://test@127.0.0.1/crushclub_ci?options=unsafe" },
    { TEST_REDIS_URL: "redis://redis.example.com:6379" }
  ]) assert.throws(() => getTestTargets({ ...base, ...overrides }));
  assert.equal(getTestTargets(base).databaseUrl, base.TEST_DATABASE_URL);
});

test("CI ignores inherited production datasource and integration credentials", async () => {
  const { testEnvironment } = await import("../scripts/ci/target.mjs");
  const env = testEnvironment({ databaseUrl: "postgresql://test@127.0.0.1/crushclub_ci", redisUrl: "redis://127.0.0.1:16389" });
  assert.equal(env.DATABASE_URL, env.TEST_DATABASE_URL);
  assert.equal(env.DIRECT_URL, env.TEST_DATABASE_URL);
  for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "SMTP_HOST", "SMTP_PASS", "PAYSTACK_SECRET_KEY", "SENTRY_DSN"]) {
    assert.equal(env[key], undefined);
  }
});

test("CI entry points fail before build or database access when disposable services are not configured", () => {
  for (const entry of ["prepare-database.mjs", "run-tests.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, "../scripts/ci", entry)], {
      env: { PATH: process.env.PATH }, encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Set CI_TEST_DATABASE=true/);
  }
});
