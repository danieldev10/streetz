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

Public event data is shared-cacheable for five minutes, event details for one minute, and raffle data for 30 seconds. The `/events` HTML uses 60-second ISR. Authenticated, payment, ticket, moderation, chat, and discovery responses remain private and uncached.

## Payment and ticket release smoke test

Use Paystack test mode and a production-like staging deployment. Never run this checklist with a live secret key merely to test deployment.

1. Buy the final available paid event ticket from two accounts concurrently. Exactly one reservation must succeed and `soldCount` must equal capacity.
2. Trigger callback and signed webhook verification for the same reference concurrently. The payment and ticket must activate once and `soldCount` must increment once.
3. Buy multiple raffle entries, deliver verification twice concurrently, and confirm one gap-free entry set and one membership grant.
4. Run the same raffle draw concurrently from two admin sessions. Both responses must identify the same persisted winner.
5. Let a paid reservation expire before verification. Confirm `refundRequired=true`, a `payment_refund_required` alert, no ticket oversell, and the documented support/refund response.
6. Create a public free event. Request a guest booking, confirm the emailed code, open the management link, and scan/check in one ticket.
7. Try the same normalized guest email again for that event. It must be rejected.
8. Verify a wrong or modified guest management token returns not found and reveals no booking data.

Ticket scanning uses the admin-only, rate-limited endpoint below. Repeating the same request returns `alreadyCheckedIn: true` without changing the original check-in time.

```http
POST /api/admin/events/:eventId/check-in
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{"code":"STZTIX-..."}
```

The automated PostgreSQL integration suite covers steps 1–4, guest capacity/token behavior, and concurrent idempotent check-in:

```bash
TEST_DATABASE_URL='postgresql://USER@localhost:5432/streetz_integration_test?schema=public' npm --prefix apps/api test
```

## Production performance baseline

The read-only baseline taken on 22 July 2026, before deploying the caching changes, measured:

- `/events`: 437 ms median TTFB, 45.6 KB decoded HTML;
- `/api/public/events`: 832 ms median TTFB, 1.9 KB decoded JSON;
- `/api/public/raffles`: 1,586 ms median TTFB, 1.8 KB decoded JSON;
- initial `/events` assets: 861 KB decoded (805 KB JavaScript and 56 KB CSS).

All sizeable responses negotiated Brotli. The public API responses still reported `max-age=0` on that deployment, so rerun `npm run measure:production` after release and confirm the new shared-cache directives and warm-cache latency. Browser LCP/INP must be collected separately with a real browser or Vercel Speed Insights; the repository script deliberately measures network timing and payloads only.

## Discovery query-plan check

The repeatable benchmark seeds 5,000 synthetic profiles only in the database supplied to `psql`:

```bash
psql "$TEST_DATABASE_URL" -f apps/api/prisma/scripts/explain-discovery.sql
```

On the local PostgreSQL 15 test database, the materialized spatial-first plan measured about 24 ms versus about 39 ms for the previous warmed plan. Re-run this on production-like statistics before a large launch and inspect index usage, row-estimate errors, buffers, and total time.

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
