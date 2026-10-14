# Release 6: multiple API instances

Run two copies of the API within one Railway service, sharing the same environment's PostgreSQL and Redis. The background worker remains a separate service. No database migration, new database, Redis volume, or AWS resource is required.

## Application changes

- HTTP responses include a random `X-Crushclub-Instance` identifier for verifying replica routing. It contains no hostname, credentials, or user information.
- SIGTERM/SIGINT first make readiness fail and reject new application requests/actions. The API waits for active HTTP handlers and socket handlers, including handlers whose clients disconnected. Socket.IO unsubscribes before Redis closes; PostgreSQL closes after mutations finish.
- Shutdown has a 30-second default deadline. A stuck operation causes a bounded failure exit; PostgreSQL rolls back an open transaction when its process connection is lost. Interrupted requests can have ambiguous outcomes, so the browser does not automatically retry message writes.
- Private and public-room sockets use WebSocket only. Railway currently [does not provide sticky sessions](https://docs.railway.com/deployments/scaling#sticky-sessions), while [Socket.IO polling needs affinity](https://socket.io/docs/v4/using-multiple-nodes/). Old browser bundles that connect using WebSocket remain compatible. Networks that block WebSocket can still use HTTP pages/history, but cannot use live chat; verify mobile Safari and the actual target networks before rollout.
- A Redis publish/subscribe connection failure closes local client transports and refuses fresh connections until the bridge recovers. Clients reconnect and fetch persisted messages; a separate healthy PING cannot hide a disconnected bridge.
- Chats rejoin their selected room after every connection acknowledgement, then fetch the latest 100 messages with the HTTP cache bypassed. Existing bounded caches merge by message ID. Older history remains available through the message API's pagination; this is not unlimited event replay.
- Guest event-room viewers also rejoin and recover history, and remain unable to send. Alerts and badge counts refresh after reconnecting.
- Message sends have a ten-second acknowledgement deadline. An interrupted send keeps the draft and asks the user to check history before resending. A lost acknowledgement can follow a successful database commit; automatic retries could duplicate a message.
- Maintenance scheduling uses PostgreSQL's clock and unique job keys, so worker clocks and overlapping deployments cannot create duplicate jobs for the same five-minute slot. Existing job leases, retries, payment locks, and Redis rate limits remain in use. SMTP delivery remains at least once, as documented in Release 4.

## Railway staging settings

Use the **crushclub-staging project**. Its Railway environment may still be named `production`; that label does not make it the live Crushclub project.

First deploy this code to the existing staging API and worker, with one API replica. Keep the existing build, certificate preparation, API migration and worker start commands. Apply these API variables:

```env
API_SHUTDOWN_TIMEOUT_MS=30000
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=45
RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=10
DB_POOL_MAX=5
```

Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60` on the worker; its existing shutdown deadline is 45 seconds. Railway's default termination buffer is zero, so application code alone cannot provide graceful shutdown. See [Railway teardown settings](https://docs.railway.com/deployments/deployment-teardown).

Keep `/api/health/ready` as the API deployment health check and `/health/ready` for the worker. Keep Wait for CI enabled. API replicas must share JWT signing/refresh secrets, queue encryption key, database/Redis URLs and all provider settings within staging. Do not use production resources or rotate secrets for this release.

Then, in the API service's **Settings → Deploy → Regions/replicas**, set **two replicas in the same region** and apply the change. Keep the worker at one replica. No duplicate API service or second public domain is needed. Do not attach a persistent volume to the API replicas; media stays in S3 and jobs stay in PostgreSQL.

Budget database connections before scaling. With API `DB_POOL_MAX=5`, worker `DB_POOL_MAX=4`, and one dedicated readiness connection per process:

- Normal operation: `2 × (5 + 1) + (4 + 1) = 17` connections.
- Old/new API overlap: `4 × (5 + 1) + (4 + 1) = 29` connections.
- Allow additional room for worker overlap, migrations, administrative connections, and other applications. Pooler client capacity and actual database connection capacity are separate limits.

On Vercel staging retain `NEXT_PUBLIC_API_URL=/api`, both server/proxy URLs pointing to the staging Railway API, and `NEXT_PUBLIC_SOCKET_URL=https://crushclub-staging.up.railway.app`. Keep the website's Release checks. Browser authentication uses the website proxy; WebSocket connects directly to Railway.

## Provider verification

After deployment, run from the repository root:

```sh
OPS_ENVIRONMENT=staging \
SMOKE_WEB_URL=https://staging.crushclub.ng \
SMOKE_API_URL=https://crushclub-staging.up.railway.app \
PRODUCTION_API_URL=https://crushclub.up.railway.app \
OPS_EXPECTED_API_INSTANCES=2 \
npm run smoke:replicas
```

This read-only check samples uncached readiness through Railway and the website proxy and requires at least two shared process identifiers. Keep the report with the deployment commit and provider logs. Sampling establishes observed routing; it cannot prove that every possible replica is healthy or replace continuous monitoring. Do not use different web/API releases during acceptance.

Then test these journeys on real devices with synthetic staging accounts and Paystack test payments:

1. Private messages, read receipts, member event rooms and guest read-only rooms work between clients on different instances.
2. Leave a chat tab through token expiry, disconnect/reconnect Wi-Fi, and background/restore mobile Safari. The selected room rejoins, recent messages and badge counts recover, and no refresh is required.
3. Deploy a new staging build while chats are active. The old instance drains within its deadline, its clients reconnect, and the surviving/replacement instances remain usable. Check `api_draining` / `api_shutdown_complete` logs. Investigate any `api_drain_timeout`, `api_shutdown_deadline` or `api_shutdown_failed` event.
4. Send during a disconnect. The button stops loading after its deadline, the draft survives an ambiguous result, and there is no automatic duplicate send.
5. Login/action limits remain shared when requests hit different instances. Worker heartbeats and queued email delivery remain healthy during overlap; the API must not run an embedded worker.
6. Competing buyers for the final ticket cannot oversell; callback/webhook/reconciliation for one payment settle once.

Record deployment IDs, tested commit, smoke report, browser/network results and restart logs before promoting to production. Repository tests alone do not satisfy these Railway/device checks.

## Validation and recovery

The CI suite now boots separate API processes using production application wiring against disposable local PostgreSQL/Redis. It covers cross-instance direct/public/private-room events, anonymous send rejection, shared HTTP budgets, concurrent scheduling, competing ticket initialization and payment settlement, Redis bridge recovery, graceful HTTP/socket writes during SIGTERM, reconnect/history recovery, cleanup with disconnected Redis, and forced-exit transaction rollback. Browser tests exercise acknowledged rejoins, stale replies, permission failures and retry cleanup.

No provider deployment or scaling is performed by those tests. After local checks pass, run the provider verification above. Keep production at its existing replica count until staging acceptance is recorded.

If a regression appears, scale the API back to one replica while investigating. If reverting the code, roll API and website back to compatible recorded deployments; retain shared secrets and the existing database schema. Keep the standalone worker running and preserve Release 4's queue recovery behavior. Do not restore polling while using multiple Railway replicas without an affinity-capable routing arrangement.
