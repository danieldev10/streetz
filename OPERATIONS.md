# crushclub operations runbook

## Deployment order

1. Back up PostgreSQL before a destructive or high-risk migration.
2. Deploy database migrations before starting API code that reads the new schema:

   ```bash
   npm --prefix apps/api run prisma:deploy
   ```

3. Start the API, check `/api/health`, and then deploy the web application.
4. Run the read-only production checks:

   ```bash
   npm run smoke:production
   npm run measure:production
   ```

`prisma:deploy` is the production command. `prisma:migrate` invokes the development drift-check workflow and should only be used against a disposable development database.

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
TEST_DATABASE_URL='postgresql://USER@localhost:5432/streetz_integration_test?schema=public' npm --prefix apps/api test
```

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

Create a compressed custom-format backup:

```bash
pg_dump "$DIRECT_URL" --format=custom --compress=9 --no-owner --no-acl --file="crushclub-$(date +%Y%m%d-%H%M%S).dump"
shasum -a 256 crushclub-*.dump
```

Recommended minimum policy:

- daily automated backups with 30-day retention;
- weekly copies retained for 12 weeks;
- a monthly copy retained for one year;
- point-in-time recovery enabled where the Supabase plan supports it;
- quarterly restore drills.

Restore drills must target a new empty database, never production:

```bash
createdb crushclub_restore_test
pg_restore --dbname="postgresql://USER@HOST:5432/crushclub_restore_test" --no-owner --no-acl --exit-on-error crushclub-YYYYMMDD-HHMMSS.dump
psql "postgresql://USER@HOST:5432/crushclub_restore_test" -c 'SELECT COUNT(*) FROM "User";'
psql "postgresql://USER@HOST:5432/crushclub_restore_test" -c 'SELECT COUNT(*) FROM "Payment";'
psql "postgresql://USER@HOST:5432/crushclub_restore_test" -c 'SELECT COUNT(*) FROM "Ticket";'
```

After restore, run migrations, the health check, authenticated login, public event reads, ticket lookup, and a non-mutating admin read. Record the backup timestamp, checksum, restore duration, row counts, operator, and outcome.
