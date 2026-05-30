#!/usr/bin/env node

/**
 * prisma-migrate-safe.mjs
 *
 * Wrapper around `prisma migrate dev` that handles PostGIS GIST indexes.
 *
 * Problem: Prisma can't track indexes on `Unsupported` types in the schema,
 * so every `prisma migrate dev` generates a `DROP INDEX "Profile_location_gist_idx"`
 * migration. This breaks shadow-database replay (the index doesn't exist at that
 * point in history) and removes a critical spatial index from the live database.
 *
 * Solution:
 *  1. Run `prisma migrate dev --create-only` to generate without applying.
 *  2. Patch any new migration that has a bare `DROP INDEX "Profile_location_gist_idx"`
 *     to use `IF EXISTS` so shadow-database replay doesn't fail.
 *  3. Apply the patched migrations with `prisma migrate deploy`.
 *  4. Restore the GIST index via `ensure-postgis-indexes.sql`.
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dirname, "prisma", "migrations");
const ENSURE_INDEXES_SQL = join(
  import.meta.dirname,
  "prisma",
  "scripts",
  "ensure-postgis-indexes.sql",
);

/** Regex matching a bare DROP INDEX without IF EXISTS */
const DROP_INDEX_RE =
  /DROP INDEX\s+(?!IF EXISTS)"Profile_location_gist_idx"/g;

function run(cmd) {
  console.log(`\n▸ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: import.meta.dirname });
}

// ── Step 1: generate migration (won't apply) ────────────────────────
try {
  run("npx prisma migrate dev --create-only");
} catch {
  // --create-only exits with 0 even if "no changes", but may also
  // exit non-zero if there's nothing to do and user cancels the prompt.
  // Either way we continue to deploy + reindex.
}

// ── Step 2: patch any bare DROP INDEX in migration files ─────────────
for (const entry of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const sqlPath = join(MIGRATIONS_DIR, entry.name, "migration.sql");
  let sql;
  try {
    sql = readFileSync(sqlPath, "utf-8");
  } catch {
    continue;
  }
  if (DROP_INDEX_RE.test(sql)) {
    const patched = sql.replace(
      DROP_INDEX_RE,
      'DROP INDEX IF EXISTS "Profile_location_gist_idx"',
    );
    writeFileSync(sqlPath, patched, "utf-8");
    console.log(`⚙  Patched ${entry.name}/migration.sql → IF EXISTS`);
  }
}

// ── Step 3: apply all pending migrations ─────────────────────────────
run("npx prisma migrate deploy");

// ── Step 4: restore the GIST index ──────────────────────────────────
run(`npx prisma db execute --file "${ENSURE_INDEXES_SQL}"`);

console.log("\n✅ Migrations applied & PostGIS indexes ensured.\n");
