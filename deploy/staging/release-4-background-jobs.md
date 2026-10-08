# Release 4: durable background jobs

The API now commits an email job in the same PostgreSQL transaction as the booking, reset token, or support message. A separate Railway worker delivers emails and runs maintenance. The API no longer runs the ticket-email or reservation-cleanup timers. Deploying this code requires the worker service; API health alone cannot prove that emails are being processed.

## What changed

| Work | Worker behavior |
| --- | --- |
| Free/paid member and guest ticket emails | Attach the existing ticket PDF; guest jobs retain an encrypted private management link |
| Password resets | Skip consumed, deleted-account, or expired tokens |
| Guest verification codes | Skip consumed, superseded, cancelled-event, or expired requests |
| Support confirmations/admin replies | Persist encrypted email contents with the request/message |
| Reservation cleanup | Queue one maintenance job per five-minute interval; checkout also cleans expired reservations when needed |
| Payment reconciliation | Scan at most 100 pending payments per interval, aged one minute to 30 days; verify against Paystack using the existing settlement transaction |

Photo uploads and image transformation continue through the current flow. Moving image processing into jobs is a separate follow-up: it needs a processing state and a deliberate change to when a photo becomes usable for verification.

Jobs use PostgreSQL `FOR UPDATE SKIP LOCKED` and expiring leases. Every claim gets a new token; an old worker cannot acknowledge, reschedule, or renew a newer worker's claim. This use of skipping locked rows is appropriate for queue consumers, as explained in [PostgreSQL's SELECT documentation](https://www.postgresql.org/docs/current/sql-select.html). SIGTERM stops new claims and drains active jobs before disconnecting the database; an abrupt kill leaves a recoverable lease.

Email delivery is **at least once**. If SMTP accepts a message and a worker dies before recording success, a retry can send a duplicate. Stable Message-ID values help identify repeats but do not guarantee mailbox deduplication. Payments, ticket issuance and sold counts remain protected by their database transaction/locks and unique job keys. Reconciliation verifies the transaction through [Paystack's verification API](https://paystack.com/docs/api/transaction/#verify); a pending result leaves reservations and settlement metadata intact.

## 1. Prepare the staging services

In the existing **staging Railway project/environment**, prepare an empty service named `crushclub-worker` and its variables. Connect it to the same GitHub repository and `staging` branch after the upgraded API is healthy and all old API replicas have stopped in step 3. This avoids a repository connection starting the worker too early.

| Worker setting | Value |
| --- | --- |
| Root directory | `apps/api` |
| Node | 22.x, matching the API |
| Build command | `npm run prisma:generate && npm run build` |
| Pre-deploy command | Certificate preparation only, below |
| Start command | Certificate preparation and `npm run start:worker`, below |
| Healthcheck path | `/health/ready` (no `/api` prefix) |
| Replicas | 1 initially |
| Wait for CI | Enabled |

Worker pre-deploy:

```sh
mkdir -p certs && printf "%s" "$SUPABASE_CA_CERT_B64" | base64 -d > certs/prod-ca-2021.crt
```

Worker start:

```sh
mkdir -p certs && printf "%s" "$SUPABASE_CA_CERT_B64" | base64 -d > certs/prod-ca-2021.crt && npm run start:worker
```

**Keep the API's current build, pre-deploy migration, start and healthcheck commands.** The API applies migrations; the worker does not need a second migration runner. No Redis volume or additional AWS resource is needed for this queue: its durable records are in PostgreSQL. Retain the existing Redis service for the API's realtime functions.

## 2. Configure worker variables and encryption

Give the worker the same **staging** database URL, database certificate, JWT/guest secrets, `WEB_APP_URL`, SMTP sandbox, Paystack test secret and Sentry configuration as the staging API. The shared startup validator also expects the API's Redis/media/verification configuration, so copy or reference those staging values consistently. Keep real values in Railway, rather than in this document or Git.

Generate a dedicated queue encryption key locally:

```sh
openssl rand -base64 32
```

Store that result as `JOBS_ENCRYPTION_KEY` on **both** staging API and worker before either deployment. Use a separate key for production later. Private links, codes, recipient details and support bodies are encrypted using AES-256-GCM and bound to their job key. Successful or expired jobs clear their ciphertext. An omitted dedicated key falls back to a distinct key derived from `JWT_REFRESH_SECRET`; changing that secret would make existing private jobs unreadable.

The dedicated key must stay the same while encrypted jobs are queued or failed awaiting retry. Before rotating it, drain or explicitly resolve those jobs; do not casually rotate API/worker keys independently. Include this key in the restricted recovery secret store alongside database backup access.

Set these worker-specific values using [worker.env.example](worker.env.example):

```env
WORKER_ENABLED=true
WORKER_CONCURRENCY=2
WORKER_POLL_MS=1000
WORKER_LEASE_MS=120000
DB_POOL_MAX=4
SENTRY_ENVIRONMENT=staging
```

Railway supplies `PORT`. Do not copy a local `PORT=4000` override. With one API and one worker, budget `(API DB_POOL_MAX + 1) + (worker DB_POOL_MAX + 1)` database connections, plus migration/provider/admin connections. Each readiness probe uses one dedicated connection. The worker's ready endpoint checks database availability and recent loop progress; `/health/live` checks the HTTP process only.

Use sandbox SMTP which captures messages for synthetic recipients. The worker now owns SMTP and Paystack verification calls, so make sure its credentials and outbound access work. No browser or Vercel queue secret is needed.

## 3. Roll out in this order

1. Record the known-good API/web deployment IDs and a usable database backup. Obtain passing `Release checks` for the exact release commit.
2. Deploy the API from that commit. Its existing pre-deploy command applies `20261008120000_durable_background_jobs`. This additive migration retains `TicketEmailDelivery` and copies pending legacy deliveries into `BackgroundJob`.
3. Wait until the upgraded API is healthy and **every old API replica has stopped**. Old API versions contain an email timer; they must not send concurrently with the new worker. Emails requested during this short gap remain queued.
4. Deploy/enable the new worker from the same commit. Confirm `/health/ready` is 200 and it records a recent heartbeat in the admin jobs endpoint. The worker imports any late legacy queue writes as well.
5. Deploy the updated web copy, then complete the acceptance list below. Set an independent uptime check for the worker readiness endpoint if the worker has a public health domain. Only health routes are exposed by the worker; it does not expose payment, member, or socket routes.
6. After staging acceptance, repeat these steps in production with `main`, production resources and a **different production encryption key**.

The worker defaults to enabled when its entry point runs. `WORKER_ENABLED=false` pauses claims and returns readiness 503; stopping/scaling down the Railway worker is the clearer maintenance control. The API stays able to enqueue jobs while the worker is paused. During backup restore drills, keep workers stopped and outbound SMTP/Paystack blocked before starting any application against restored customer data.

## Inspect failures and retry deliberately

These endpoints require an admin access token and return uncached responses:

```http
GET /api/admin/jobs?state=FAILED&take=50
Authorization: Bearer <admin-access-token>
```

The response includes counts by type/state, recent worker heartbeats, oldest pending schedule, a paginated list and `nextCursor`. Continue with `&cursor=<nextCursor>`. It exposes IDs, attempts, times and safe error codes; private payloads and lease tokens are omitted. A healthy API with no recent worker heartbeat needs investigation even if `/api/health/ready` succeeds.

After correcting the cause of a failed job:

```http
POST /api/admin/jobs/<job-id>/retry
Authorization: Bearer <admin-access-token>
```

Only failed, unexpired jobs can be retried. This resets their retry budget and records the admin ID in the log. Do not retry a job blindly: check the SMTP/provider state first, since an ambiguous email failure can already have reached the mailbox. To resend an expired code or reset link, create a new request through the normal flow.

Default jobs receive eight attempts, with exponential delay from 30 seconds to a maximum of 30 minutes. Payment reconciliation receives 20 attempts. Pending Paystack results and provider/network errors retry within that budget; exhausted jobs require operator review. A successful payment arriving after an expired or unavailable reservation follows the existing refund-required path and never oversells capacity. Reconciliation does not automatically issue refunds.

Successful job metadata is retained for seven days. Failed metadata remains for investigation; encrypted expired credentials are cleared. Heartbeats older than one day are removed. Alert on:

- Sentry `Background job exhausted: <type>` (safe job ID/type/attempts/code only);
- `background_worker_pass_failed` and `worker_heartbeat_failed`;
- worker readiness failures or no recent heartbeat;
- growing overdue pending backlog;
- existing `payment_refund_required` events, with manual reconciliation/refund handling.

Confirm the **worker's** Sentry alert reaches the owner. An existing API alert does not demonstrate that the new service has its DSN configured.

## Staging acceptance

- Free member, free guest and paid test tickets arrive with PDFs; guest retry includes the original private management link.
- Guest codes, password reset links and support confirmations/replies arrive from the worker. Consumed/expired tokens do not send.
- Stop the worker, create a synthetic booking or reset request, then restart it. The queued work is delivered.
- Simulate temporary SMTP failure in the sandbox, correct it, and confirm a retry succeeds. Confirm exhausted failures appear without private values and can be manually retried.
- Run two staging workers briefly against the same synthetic job backlog. Payment/ticket records and sold counts remain unchanged by duplicate verification.
- Restart a worker during a job; verify lease recovery. SIGTERM should drain active work; an abrupt termination must allow a new claim after lease expiry.
- Verify callback, webhook and reconciliation for one test payment settle once. A still-pending payment must keep its active reservation. Expired reservations must not oversell or silently grant admission.
- Verify worker readiness fails when its database is unavailable, recovers afterward, and rejects an unhealthy deployment.

Repository validation on 8 October 2026: all 58 migrations applied to a fresh local PostgreSQL/PostGIS database; 104 API tests passed with zero skips, including competing claims, process kill/lease recovery, transactional rollback, encrypted private jobs, reconciliation races, non-UTC database sessions and bounded worker health. Two actual worker processes with a localhost SMTP fixture delivered one job once, retried a temporary failure, and drained a held email on SIGTERM. API runtime checks confirmed admin authorization, pagination validation, omitted private payloads, manual retry and the absence of an embedded worker. API lint/build and web lint/type checking/production build also passed. These local results do not substitute for the Railway staging acceptance above.

## Rollback

Stop/drain the worker **before** rolling the API back to a version containing the legacy timer. Keep the new tables and migration in place; do not undo this additive migration during a code rollback. Legacy deliveries marked complete by the new worker stay complete in the retained old table.

The old API only processes its old queue. Jobs created by Release 4 stay in `BackgroundJob` until a compatible worker resumes. Record this pending backlog and resolve the regression; reverting API code alone does not deliver the new queue. Legacy guest jobs imported from before this release lack the raw private token, so their attached PDF can be delivered but the old private management URL cannot be reconstructed.
