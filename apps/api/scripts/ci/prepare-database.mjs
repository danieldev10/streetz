import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { getTestTargets, testEnvironment } from "./target.mjs";

const targets = getTestTargets();
const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
const adminUrl = new URL(targets.databaseUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const admin = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 3_000, query_timeout: 3_000 });
await admin.connect();
try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'crushclub_ci'");
  // template0 avoids inheriting public-schema PostGIS from Docker's default DB.
  if (existing.rowCount === 0) await admin.query('CREATE DATABASE "crushclub_ci" TEMPLATE template0');
} finally { await admin.end(); }

const client = new pg.Client({ connectionString: targets.databaseUrl, connectionTimeoutMillis: 3_000, query_timeout: 3_000 });
await client.connect();
try {
  const marker = await client.query("SELECT to_regclass('ci_metadata.target') AS marker");
  if (marker.rows[0].marker) {
    const owner = await client.query("SELECT kind FROM ci_metadata.target");
    if (owner.rows[0]?.kind !== "crushclub-integration-tests") throw new Error("Disposable database marker does not match.");
  } else {
    const tables = await client.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') LIMIT 1");
    if (tables.rowCount) throw new Error("Refusing to prepare a nonempty database without a CI marker.");
    await client.query("CREATE SCHEMA ci_metadata");
    await client.query("CREATE TABLE ci_metadata.target (kind text NOT NULL)");
    await client.query("INSERT INTO ci_metadata.target VALUES ('crushclub-integration-tests')");
  }
} finally { await client.end(); }

const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
  cwd: apiRoot, env: testEnvironment(targets), stdio: "inherit"
});
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);
console.log("Disposable crushclub_ci database prepared.");
