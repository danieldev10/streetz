export function getTestTargets(env = process.env) {
  if (env.CI_TEST_DATABASE !== "true") throw new Error("Set CI_TEST_DATABASE=true to confirm use of disposable CI services.");
  const database = parse(env.TEST_DATABASE_URL, "TEST_DATABASE_URL", ["postgres:", "postgresql:"]);
  if (database.pathname !== "/crushclub_ci") throw new Error("TEST_DATABASE_URL must target the disposable crushclub_ci database.");
  if ([...database.searchParams].some(([key, value]) => key !== "schema" || value !== "public")) {
    throw new Error("TEST_DATABASE_URL only supports the public schema; connection options are not allowed.");
  }
  const redis = parse(env.TEST_REDIS_URL, "TEST_REDIS_URL", ["redis:"]);
  if (redis.search || !["", "/", "/0"].includes(redis.pathname)) throw new Error("TEST_REDIS_URL must use the disposable Redis database 0.");
  return { databaseUrl: database.href, redisUrl: redis.href };
}

function parse(value, key, protocols) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${key} is required and must be a valid URL.`); }
  if (!protocols.includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hash) {
    throw new Error(`${key} must point to a disposable service on loopback, never a remote database.`);
  }
  return url;
}

export function testEnvironment(targets) {
  // Do not forward real AWS, SMTP, payment, Sentry, or datasource credentials.
  return {
    PATH: process.env.PATH,
    ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
    CI: "true",
    CI_TEST_DATABASE: "true",
    NODE_ENV: "test",
    TZ: "UTC",
    DATABASE_URL: targets.databaseUrl,
    DIRECT_URL: targets.databaseUrl,
    TEST_DATABASE_URL: targets.databaseUrl,
    TEST_REDIS_URL: targets.redisUrl,
    REDIS_URL: targets.redisUrl,
    WEB_APP_URL: "http://127.0.0.1:3000",
    JWT_ACCESS_SECRET: "ci-only-access-secret",
    JWT_REFRESH_SECRET: "ci-only-refresh-secret",
    GUEST_TICKET_SECRET: "ci-only-guest-secret",
    FACE_VERIFICATION_MODE: "off",
    FACE_VERIFICATION_REQUIRED: "false"
  };
}
