# New Crushclub staging environment

Release 4 adds a separate Railway worker. Follow [the background-jobs deployment guide](deploy/staging/release-4-background-jobs.md) after the base services below are ready. API deployment now queues emails and requires that worker to deliver them.

This is the account-owner setup guide for the first reliability batch. The repository includes CI, dependency health checks, isolated test fixtures, and target-specific smoke checks. No staging cloud resources, deployment gates, alerts, or provider backups have been created by these files. Mark the evidence table at the end as each provider step is verified.

## 1. Create the staging database first

Create a **new Supabase project**, named `crushclub-staging`, with a new database password. Start with synthetic users and events; do not copy the production database into the application staging environment.

From that project's Connect panel, record its application connection URL and direct migration URL. Choose a connection method reachable from Railway; session pooling is an alternative when direct networking is unavailable. Preserve the project's TLS settings and download its CA certificate if the URLs use `sslrootcert=certs/prod-ca-2021.crt`. Base64-encode that staging certificate for `SUPABASE_CA_CERT_B64`; the historical filename does not mean use the production certificate.

The migrations create `extensions.postgis`. The migration user needs permission to create/use that extension. On a fresh project, check where PostGIS is installed before migrating:

```sql
SELECT e.extname, n.nspname
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'postgis';
```

If already installed in another schema, resolve it on this new staging project before applying the migrations; do not change production's extension as part of this setup. Apply the existing migration history, not `prisma migrate dev` or `db push`.

Allow `DB_POOL_MAX + 1` database connections per API instance: readiness uses one extra connection. The proposed staging application pool is five, so budget six per instance, plus migrations and provider connections. Review the actual database limit before increasing replicas.

## 2. Create isolated AWS media resources

Create a staging media bucket in `eu-west-1`, with ACLs disabled, Block Public Access enabled, and S3-managed encryption. Suggested global name: `crushclub-staging-media-ACCOUNT_ID` (use an available name). Create a **new CloudFront distribution** with origin access control for this bucket. Its bucket policy should allow only that distribution's ARN. Keep the existing production distribution and buckets unchanged.

Create staging credentials scoped to the new media bucket using the application's existing media permissions. Do not give this principal access to the production media or verification buckets. Record the bucket name, region, and new CDN URL in the API template. The web template only needs the public CDN URL, which configures Next image access.

Once the staging web URL is known, configure the staging media bucket's upload CORS for that exact HTTPS origin (and localhost if needed for development), `PUT` and `GET`/`HEAD`, the application's upload headers, and exposed `ETag`. CORS does not grant permission: uploads still use presigned URLs. Test an actual browser upload.

For the initial API bootstrap use `FACE_VERIFICATION_MODE=off` and `FACE_VERIFICATION_REQUIRED=false`. Before release acceptance, create a separate private staging verification bucket and Cognito identity pool in `eu-west-1`, configure its guest role for `rekognition:StartFaceLivenessSession`, and give the API staging-only liveness/session/result/face comparison permissions plus access to the staging `face-liveness/*` objects. Follow the same working production flow with **new resource IDs and scoped credentials**. Set `NEXT_PUBLIC_AWS_LIVENESS_IDENTITY_POOL_ID` in the staging web project. Switch staging to the same verification mode/required setting intended for production and verify the full browser flow; an off-mode bootstrap is not a liveness acceptance test.

Use [AWS's Face Liveness integration guide](https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html) when configuring the new resources. Staging liveness calls still use AWS resources and may incur charges.

For flow testing with synthetic profile photos, set the **staging API** to `FACE_VERIFICATION_MODE=prototype-pass` and `FACE_VERIFICATION_REQUIRED=true`. Complete the real camera check: the attempt keeps its actual failure/review status and scores, while the user receives test access with `PROTOTYPE_BYPASS` recorded separately. Unfinished/expired sessions and AWS permission, storage or network errors do not grant access. Before checking production verification behavior, switch staging back to the mode intended for release and test both matching and nonmatching faces.

If upload succeeds but photos display as placeholders, check the image URL returned by `/api/profiles/me`. Its host must be the **staging media CloudFront distribution** and that distribution's S3 origin must be the staging media bucket. Set Railway staging's `MEDIA_CDN_BASE_URL` and Vercel staging's `NEXT_PUBLIC_MEDIA_CDN_BASE_URL` to the same staging HTTPS CDN URL, then redeploy both. An upload can succeed against staging S3 while an incorrect CDN URL reads a different bucket. Also verify the staging distribution's origin access control and its exact distribution ARN in the staging bucket's read policy; changing upload CORS does not fix CloudFront read access.

## 3. Create the Railway staging API and Redis

In Railway, create a new **empty environment** called `staging` (or a separate staging project). Add a new Redis service and an API service connected to this repository. Do not duplicate production variables into an immediately running staging API.

API settings:

| Setting | Value |
| --- | --- |
| Root directory | `apps/api` |
| Runtime | Node 22, matching repository engines |
| Build | `npm run prisma:generate && npm run build` |
| Pre-deploy | Existing certificate preparation followed by `npm run prisma:deploy` |
| Start | Existing certificate preparation followed by `npm run start` |
| Healthcheck path | `/api/health/ready` |
| Initial replicas | 1 |

With the staging CA variable supplied, use the existing commands:

```sh
# Pre-deploy
mkdir -p certs && printf "%s" "$SUPABASE_CA_CERT_B64" | base64 -d > certs/prod-ca-2021.crt && npm run prisma:deploy

# Start
mkdir -p certs && printf "%s" "$SUPABASE_CA_CERT_B64" | base64 -d > certs/prod-ca-2021.crt && npm run start
```

Populate the service's variables from [deploy/staging/api.env.example](deploy/staging/api.env.example). Use the new Supabase project for both datasource URLs, the **staging Redis service** for `REDIS_URL`, fresh JWT/guest secrets, staging AWS credentials, Paystack test keys, and sandbox SMTP credentials. `NODE_ENV=production` enables strict startup validation; `SENTRY_ENVIRONMENT=staging` labels telemetry. Use Railway's public API domain for the web proxy and sockets.

Generate three distinct secrets locally, for example by running `openssl rand -hex 32` three times. Store the results in provider variables, not in a committed file or chat.

Keep production's current build/pre-deploy/start commands. Change its healthcheck path only after validating staging. [Railway healthchecks](https://docs.railway.com/deployments/healthchecks) gate deployment activation; configure a separate monitor for failures after activation.

## 4. Create a stable Vercel staging web project

Create a new Vercel project, `crushclub-staging`, from this repository, with root directory `apps/web` and Node 22. Use a dedicated staging branch or deploy the chosen commit into this project. Its stable project domain (or `staging.crushclub.ng`) is the staging web origin. Keep `crushclub.ng` assigned to the existing production project.

Populate **this staging project's Production variables** from [deploy/staging/web.env.example](deploy/staging/web.env.example); Production here describes Vercel's deployment tier, not Crushclub's live environment. The API, socket, CDN, and identity pool must all belong to staging. Configure any Preview deployments separately if you want them to work against staging; a changing preview origin will not automatically match the API's single configured web origin.

Set the API's `WEB_APP_URL` to this exact canonical staging origin and add it to staging S3 CORS. Redeploy the API and web after setting variables. If Vercel deployment protection is enabled, configure an automation bypass secret for smoke checks without disabling protection; expose that secret only to the operator/monitor, not browser variables.

## 5. Configure test payments, email and errors

Use a dedicated SMTP sandbox which captures messages and cannot deliver them to arbitrary real recipients. Create synthetic accounts for testing. Configure a Paystack test-mode integration (`sk_test_...`) with the staging webhook and callback URLs. The code's webhook is `https://STAGING_API/api/payments/paystack/webhook`; the browser callback is `https://STAGING_WEB/payment/callback`.

Use separate staging Sentry projects for web/API, or a verified environment filter if sharing projects. Set staging environment labels and commit releases. Configure an alert recipient in Sentry and the uptime provider. Trigger a controlled staging error and verify a received notification and useful stack trace. Keep payment-refund and webhook-processing log alerts as described in [OPERATIONS.md](OPERATIONS.md); Sentry exception alerts alone do not prove that those log events alert.

## 6. Establish and prove release gates

After publishing the change set and completing its first GitHub Actions run, configure the release branch ruleset to require **`Release checks`** and prevent unchecked direct pushes. CI includes API, web and operational checks; database tests cannot silently skip.

Enable **Wait for CI** on both Railway API services. It requires the GitHub workflow and appropriate GitHub App permissions. [Railway's documentation](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci) explains that workflow conclusions gate deployment. Push/dispatch CI runs are not automatically cancelled; only superseded pull-request runs may be cancelled. Prove the configured release path with an intentionally failing check on an isolated test branch, then a staging-only commit after the staging deployment gate is enabled.

Vercel's Git integration can deploy commits automatically; a checked-in GitHub workflow alone does not establish a Vercel gate. In each project's Settings → Deployment Checks, add GitHub's `Release checks` as a required check. [Vercel's deployment-check documentation](https://vercel.com/docs/deployment-checks) explains that production builds remain unpromoted until the selected checks pass. The dedicated staging project's Production tier also needs this setting. If the setting is unavailable, use deliberate promotion of the recorded tested commit and disable uncontrolled production autodeploys. Build with each environment's own variables; do not promote a staging web artifact with staging API endpoints to the live domain.

Record the API and web deployment SHAs and confirm they match the approved release SHA. Do not deploy "latest" if newer unchecked commits have arrived. No repository file changes branch protection or dashboard settings by itself.

## 7. Run staging acceptance and recovery

Supply the actual staging URLs explicitly. The script is read-only and never defaults to the production site:

```sh
export OPS_ENVIRONMENT=staging
export OPS_RELEASE=REPLACE_WITH_TESTED_COMMIT_SHA
export SMOKE_WEB_URL=https://REPLACE-STAGING-WEB-DOMAIN
export SMOKE_API_URL=https://REPLACE-STAGING-API-DOMAIN
export PRODUCTION_API_URL=https://REPLACE-ACTUAL-PRODUCTION-API-DOMAIN
# If necessary, obtain SMOKE_VERCEL_BYPASS_SECRET through your secret manager.
npm run smoke:production
npm run measure:production
```

The historical script names work for all explicit environments. Use the canonical origin: redirects fail checks deliberately. Store output with the release record. Health succeeds only if PostgreSQL and the Redis connections needed for realtime are ready.

Then test login/member and admin logout, guest discovery, pool entry/withdrawal, real-time messages, guest/member event-room read/write permissions, one-photo upload/display, liveness completion without a manual refresh, free member and guest tickets/emails/PDFs, paid tickets with test keys, ticket check-in and repeat scans. See the payment concurrency checklist in [OPERATIONS.md](OPERATIONS.md). HTTP smoke checks do not replace browser journeys.

In staging, briefly make Redis unavailable and separately make the database unavailable. Confirm readiness 503 within three seconds, liveness 200 while the API process is still serving, no connection growth/backlog, then readiness 200 on recovery. A failure at startup may prevent the API from listening at all; that also must fail deployment. Verify Railway rejects a new unready deployment.

Configure **two continuous uptime checks**: direct API `/api/health/ready` and the web `/events` plus web-to-API readiness. Proposed settings: a 60-second interval, five-second timeout, alert after three consecutive failed checks, and a recovery notification. Follow deployment protection requirements for the web monitor. Prove both notifications with the controlled outage. Railway's deployment check is not the continuous monitor.

Perform a backup restore and previous-deployment rollback using [OPERATIONS.md](OPERATIONS.md). Restrict restored customer data to a separate recovery environment with outbound email/payments/jobs blocked; normal application staging should continue using synthetic data.

## Completion evidence

Provider checks remain pending until verified and recorded. Current release-gate evidence and remaining dashboard steps are in [deploy/staging/release-gate-status.md](deploy/staging/release-gate-status.md). The repository work does not certify a cloud feature is active.

| Evidence | Initial status |
| --- | --- |
| Fresh GitHub runner: API/web/ops pass, zero skipped DB tests | Confirmed on GitHub, 8 October 2026: 67 API tests, 4 operational tests, web lint/types/build; zero skipped tests |
| New Supabase, Railway Redis/API and Vercel project URLs recorded | Staging website/API reachable; isolated database and Redis provisioned |
| AWS resources, payment keys, email and secrets isolated | Pending account setup |
| Railway readiness gate and continuous outage/recovery alerts demonstrated | Pending staging drill |
| Sentry error alert received by designated owner | Confirmed by owner: email alerts received, 8 October 2026 |
| Failed CI prevents the configured production release path | GitHub merge block and Vercel staging deployment block demonstrated; both provider settings owner-confirmed; Railway CI skip reason awaiting dashboard confirmation |
| Browser journeys pass for the tested API/web SHA | Owner reports all flows pass, 8 October 2026; staging baseline `4d6a61a`, identical-source cleanup `139b89a`, provider records and passing smoke checks captured |
| Backup retention/PITR checked against the actual provider plan | Pending provider inspection |
| Encrypted backup restored and relationships verified in isolation | Pending provider recovery drill |
| Previous API/web deployment restored with compatible schema | Pending staging rollback drill |

Keep the evidence, timestamps, release SHA, deployment IDs, and backup metadata privately with the release record. Do not store secrets or customer records in this table.
