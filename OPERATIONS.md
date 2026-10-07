# crushclub operations runbook

## Deployment order

Use [STAGING.md](STAGING.md) to create the new staging resources and complete the provider evidence checklist. Repository checks alone do not configure deployment gates or alerts.

1. Require a successful `Release checks` run and staging acceptance for the release SHA. Record the current API/web deployment IDs and confirm a usable recent database backup. Back up PostgreSQL before a destructive or high-risk migration.
2. Deploy database migrations before starting API code that reads the new schema:

   ```bash
   npm --prefix apps/api run prisma:deploy
   ```

3. Start the API, check `/api/health/ready` directly, and then deploy the web application from the same tested SHA with production variables.
4. Run the read-only production checks:

   ```bash
   export OPS_ENVIRONMENT=production
   export OPS_RELEASE=REPLACE_WITH_RELEASE_SHA
   export SMOKE_WEB_URL=https://REPLACE_WITH_CANONICAL_PRODUCTION_WEB_DOMAIN
   export SMOKE_API_URL=https://REPLACE_WITH_PRODUCTION_API_DOMAIN
   npm run smoke:production
   npm run measure:production
   ```

`prisma:deploy` is the production command. `prisma:migrate` invokes the development drift-check workflow and should only be used against a disposable development database.

## CI and local reproduction

CI runs locked installs, Prisma validation/generation, all migrations on a disposable PostGIS database, API lint/build/tests, web lint/type checking/build, and operational tests. The required GitHub check is named `Release checks`. The API CI entry point rejects remote databases, requires the exact loopback `crushclub_ci` database and its preparation marker, strips inherited integration credentials, and fails on skipped tests. It never prepares or resets a developer database.

Use Node 22.13 or later in the 22.x series. With Docker Compose installed, reproduce a fresh CI run from the repository root:

```bash
npm --prefix apps/api ci
npm --prefix apps/web ci
docker compose -f deploy/ci/compose.yml up -d --wait
export CI_TEST_DATABASE=true
export TEST_DATABASE_URL='postgresql://crushclub_ci:ci-only-password@127.0.0.1:55439/crushclub_ci?schema=public'
export TEST_REDIS_URL='redis://127.0.0.1:16389'
npm run ci:prepare
npm run verify:api
npm run verify:web
npm run test:ops
docker compose -f deploy/ci/compose.yml down
```

The services use fixed loopback ports and no persistent volumes. Stop any older fixtures using those ports before starting these containers. Stop them even after a failed check. Test database preparation is repeatable and uses `template0`, avoiding the PostGIS extension already installed in Docker's default database. Never replace these URLs with a production or normal development connection.

## Health endpoints and monitoring

| Endpoint | Purpose |
| --- | --- |
| `/api/health/live` | Process can respond; no dependency checks |
| `/api/health/ready` | PostgreSQL query and Redis health; 200 when ready, 503 otherwise |
| `/api/health` | Compatible legacy liveness response |

All three bypass user rate limits and return `Cache-Control: no-store`. Readiness checks run in parallel, share in-flight work, and cache results for 250 ms to bound monitoring load. Database connection/query limits and Redis command timeouts keep probes within the three-second target. A dedicated one-connection database pool and Redis probe avoid queued work in the application's normal pools; disconnected realtime publisher/subscriber clients also fail readiness. Budget `replicas × (DB_POOL_MAX + 1)` database connections, plus migration/provider/admin connections. Readiness checks do not assert SMTP, AWS, Paystack or application correctness; cover those in staging journeys and provider alerts.

Smoke and measurement scripts require `OPS_ENVIRONMENT`, `SMOKE_WEB_URL` and `SMOKE_API_URL`, use per-request deadlines including response bodies, and label output with `OPS_RELEASE`. The smoke script checks direct API readiness and web-to-API routing separately. For protected Vercel staging deployments, supply `SMOKE_VERCEL_BYPASS_SECRET` through your secret manager. It is sent only to the selected web target; requests never follow redirects. Use the canonical URL instead of a redirecting alias.

Configure Railway's deployment health path and independent continuous monitoring as described in [STAGING.md](STAGING.md). An unavailable dependency at startup may stop the API before it listens, which must also fail the deployment check.

## Application rollback

Before each release, record both known-good deployment IDs, their SHAs, configuration versions, migration names, and the backup timestamp. For this reliability batch there is no new application-schema migration.

1. Stop further production promotions during the incident. Determine whether it is an application regression or a dependency/provider outage.
2. For a compatible application regression, restore the recorded previous Railway API deployment and previous Vercel production deployment using the providers' deployment controls. If using a rebuild, choose the recorded SHA with production variables, not the current latest branch commit.
3. Run the explicit production smoke checks and verify login, ticket reads, and realtime behavior. Record recovery time and deployment IDs.
4. A code rollback does not undo a database migration or an external payment. Use additive migrations, keep old and new code schema-compatible during rollout, and roll forward with a corrective migration if the previous code cannot read the new schema. Restore production data only as an incident decision after checking writes/payments since the backup.

Prove this procedure first in staging. A local build cannot demonstrate that provider rollback works.

## Required production configuration

The API now validates critical configuration at startup. Production requires database, access/refresh JWT, web origin, Redis, Paystack, SMTP, S3 bucket/region, and stable media-CDN settings. Face-verification deployments also require a verification bucket. Missing or invalid keys stop startup with a message containing key names only, never values.

Use [apps/api/.env.example](apps/api/.env.example) as the non-secret reference. Keep actual values in Railway/Vercel. Do not commit them.

## Error monitoring and logs

Create separate Sentry projects for the API and web application.

Railway API variables:

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_TRACES_SAMPLE_RATE=0.1` initially
- `SENTRY_RELEASE` is optional; Railway's commit SHA is used when available

Vercel web variables:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN` for source-map uploads
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1`

Production API logs are structured JSON. Every HTTP response includes `x-request-id`; support reports should capture it. Alert on:

- `payment_refund_required` immediately;
- `payment_webhook_processing_failed` immediately;
- sustained HTTP 5xx responses;
- p95 API latency above one second;
- failed deployment health checks;
- new high-frequency Sentry issues.

The API never includes secrets or request bodies in request logs. Sentry is configured with default PII collection disabled.

## Compression and public caching

Checked on 22 July 2026: the production path is Vercel → Railway for `/api`, verified by Railway response headers through the Vercel rewrite. Public HTML and JSON negotiate Brotli/gzip. Tiny responses such as health JSON remain uncompressed, which is expected.

Public event data is shared-cacheable for five minutes and event details for one minute. The `/events` HTML uses 60-second ISR. Authenticated, payment, ticket, moderation, chat, and member discovery responses remain private and uncached.

Guest Discover uses `GET /public/discovery/people`, a read-only preview capped at 12 eligible pool members with no pagination. It exposes only names, ages, states, statuses, and one photo thumbnail. Withdrawn, inactive, expired, incomplete, and (when required) unverified profiles are excluded. The endpoint is limited to 30 requests per minute per IP, sends `Cache-Control: no-store`, and the web app does not persist its results. Guest profile actions and discovery controls prompt for authentication and return to `/discover` after login; member access gates still apply. This preview makes these basic fields public, including to withdrawn members browsing while logged out.

## Payment and ticket release smoke test

Use Paystack test mode and a production-like staging deployment. Never run this checklist with a live secret key merely to test deployment.

1. Buy the final available paid event ticket from two accounts concurrently. Exactly one reservation must succeed and `soldCount` must equal capacity.
2. Trigger callback and signed webhook verification for the same reference concurrently. The payment and ticket must activate once and `soldCount` must increment once.
3. Let a paid reservation expire before verification. Confirm `refundRequired=true`, a `payment_refund_required` alert, no ticket oversell, and the documented support/refund response.
4. Create a public free event. Request a guest booking, confirm the emailed code, open the management link, and scan/check in one ticket.
5. Try the same normalized guest email again for that event. It must be rejected.
6. Verify a wrong or modified guest management token returns not found and reveals no booking data.

Ticket scanning uses the admin-only, rate-limited endpoint below. Repeating the same request returns `alreadyCheckedIn: true` without changing the original check-in time.

```http
POST /api/admin/events/:eventId/check-in
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{"code":"STZTIX-..."}
```

The automated PostgreSQL integration suite covers payment and ticket concurrency, guest capacity/token behavior, and concurrent idempotent check-in:

```bash
npm run ci:prepare
npm run verify:api
```

Use the disposable service variables from the CI reproduction section. Missing database configuration fails this command instead of skipping the integration checks.

## Production performance baseline

The read-only baseline taken on 22 July 2026, before deploying the caching changes, measured:

- `/events`: 437 ms median TTFB, 45.6 KB decoded HTML;
- `/api/public/events`: 832 ms median TTFB, 1.9 KB decoded JSON;
- initial `/events` assets: 861 KB decoded (805 KB JavaScript and 56 KB CSS).

All sizeable responses negotiated Brotli. The public API responses still reported `max-age=0` on that deployment, so rerun `npm run measure:production` after release and confirm the new shared-cache directives and warm-cache latency. Browser LCP/INP must be collected separately with a real browser or Vercel Speed Insights; the repository script deliberately measures network timing and payloads only.

## Discovery query-plan check

The repeatable benchmark seeds 5,000 synthetic profiles only in the database supplied to `psql`:

```bash
psql "$TEST_DATABASE_URL" -f apps/api/prisma/scripts/explain-discovery.sql
```

On the local PostgreSQL 15 test database, the materialized spatial-first plan measured about 24 ms versus about 39 ms for the previous warmed plan. Re-run this on production-like statistics before a large launch and inspect index usage, row-estimate errors, buffers, and total time.

## One-photo profile migration

The application accepts one user-selected profile photo. The original upload plus its thumbnail, card, and full-size derivatives remain in S3 for responsive delivery.

After deploying the one-photo API restriction, generate a cleanup manifest without changing data:

```bash
npm run profile-photos:consolidate -- --manifest=./profile-photo-consolidation.json
```

Review the manifest. For each user, the command retains the first photo by `sortOrder`, `createdAt`, and `id`, in that order. Apply that exact cleanup plan only after confirming the retained photo selections. The apply command requires the reviewed manifest and stops for any user whose photo set changed after the dry run:

```bash
npm run profile-photos:consolidate -- --apply --manifest=./profile-photo-consolidation.json
```

The apply command removes secondary `ProfilePhoto` rows, normalizes the retained photo to slot and sort order zero, then deletes every unreferenced original, thumbnail, card, and full-size S3 object. The manifest is updated after each user so an interrupted cleanup can be audited. Keep it private because object keys contain user identifiers.

If any S3 deletion fails, retry it from the same manifest. Referenced objects are checked again and will not be deleted:

```bash
npm run profile-photos:consolidate -- --retry-manifest=./profile-photo-consolidation.json
```

If S3 bucket versioning is enabled, also permanently remove noncurrent versions and delete markers. If immediate removal from public delivery is required, invalidate the removed paths in CloudFront because immutable variants can remain cached after their S3 objects are deleted.

## PostgreSQL backup and restore

Use the direct PostgreSQL connection, not a transaction-pooler URL. Store dumps encrypted in access-controlled storage outside the database provider.

Inspect the actual Supabase project's backup retention and PITR settings; repository files do not enable them. Proposed objectives are RPO (maximum lost writes) of 24 hours with daily dumps, or 15 minutes if PITR is purchased/configured, and RTO (restoration time) of two hours. These are targets until a provider recovery drill demonstrates them; [Supabase's backup documentation](https://supabase.com/docs/guides/platform/backups) describes plan-dependent capabilities. Database dumps do not include S3 photos or verification objects, which need their own retention/recovery policy.

Create a compressed custom-format backup:

```bash
umask 077
task_backup_file="crushclub-$(date -u +%Y%m%d-%H%M%S).dump"
pg_dump "$BACKUP_DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file="$task_backup_file"
age --recipient "$BACKUP_AGE_RECIPIENT" --output="$task_backup_file.age" "$task_backup_file"
shasum -a 256 "$task_backup_file.age"
```

Set `BACKUP_DATABASE_URL` to the direct, TLS-verified PostgreSQL connection from the secret manager. Remove Prisma-only query options such as `schema=public`; keep libpq TLS parameters. This example requires [age](https://github.com/FiloSottile/age#usage) and a configured recovery recipient. Keep the decryption identity separately in the recovery secret store and verify it can decrypt. Upload only the encrypted archive and checksum to restricted backup storage; remove the plaintext working copy after the verified upload. Use a `pg_dump` version at least as new as the server, and the matching `pg_restore`. For hosted recovery, account for Supabase-managed schemas/roles and use the provider-supported restore method where a whole-database dump cannot be restored directly.

Recommended minimum policy:

- daily automated backups with 30-day retention;
- weekly copies retained for 12 weeks;
- a monthly copy retained for one year;
- point-in-time recovery enabled where the Supabase plan supports it;
- quarterly restore drills.

Restore drills must target a new empty database, never production:

```bash
export RESTORE_DATABASE_URL='postgresql://USER@ISOLATED_HOST:5432/crushclub_restore_test'
# Create crushclub_restore_test on that isolated host using template0.
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output=restore.dump crushclub-YYYYMMDD-HHMMSS.dump.age
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-acl --exit-on-error restore.dump
psql "$RESTORE_DATABASE_URL" -c 'SELECT COUNT(*) FROM "User";'
psql "$RESTORE_DATABASE_URL" -c 'SELECT COUNT(*) FROM "Payment";'
psql "$RESTORE_DATABASE_URL" -c 'SELECT COUNT(*) FROM "Ticket";'
```

Before restoring, inspect the destination host/project and assert it is a new empty database. Do not use production credentials or `--clean`. A recovery database containing customer data needs restricted access and blocked outbound email, payment requests and background jobs before any application is started; the API currently runs scheduled work internally. Do not connect a normal staging API to restored customer data.

Compare migration history and representative user/event/ticket/payment relationships with the backup record. Then verify critical reads and application health in the isolated recovery environment; check login only with an approved test account. Record backup time, encrypted checksum, schema/migration versions, source/destination resource IDs, duration, row counts, operator, recovery point and result. Retire the recovery database and plaintext dump after the evidence is recorded. Schedule and prove the automation, retention and alert on failed backups separately.
