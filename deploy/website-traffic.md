# Website traffic metrics

Admin → Metrics → Website traffic shows first-party counts for the current environment. Production and staging use separate databases. Tracking starts at deployment; no historical traffic is backfilled.

* **Website visits:** random browser sessions, renewed after 30 minutes without activity. Tabs share a visit when browser storage is available. These are not unique people.
* **Page views:** visible route openings and reloads after session restoration. React rerenders, background tabs and API calls do not count. Returning after an expired visit counts a new view.
* **Landing page views:** the main `/events` page, including visits redirected from `crushclub.ng`.
* **Guest views / Member views:** page views while signed out / signed in. These sum to page views. Login and landing views overlap these totals.
* **Login page views:** actual login screen openings, including switching from Create to Login. Signup screens count as guest views.

Periods use Africa/Lagos (WAT). Last 7/30 days includes today and the preceding 6/29 calendar days. Visits spanning midnight belong to the day they started; subsequent views belong to their own day.

Admin accounts and administrative routes, previews, localhost, known bots and automated browsers are excluded. These are browser analytics estimates: disabled JavaScript, blocked storage/network requests, bots that disguise themselves and cleared browser data affect counts.

`POST /api/analytics/page-view` accepts only random event/visit UUIDs and a fixed page kind. Trusted browser origins and shared rate limits apply. Optional signed access tokens establish member status; no account identifier, raw URL, query, IP or message/profile content is stored in traffic tables. A single PostgreSQL statement atomically deduplicates requests across API replicas. One bounded retry retains the same event ID. Analytics never refreshes tokens or signs a user out.

Daily aggregates are retained. The worker's existing five-minute maintenance job deletes temporary deduplication identifiers older than seven days in batches of 10,000 per table. No new Railway/Vercel variables or services are required. Deploy the additive migration with the API before the new web bundle; stale web bundles simply do not contribute until refreshed.

Verification: `apps/web/test/website-traffic.test.cjs` covers sessions, activity, retries and exclusions. `apps/api/test/website-traffic.test.js` exercises HTTP validation/auth/origin/rate limits, concurrent PostgreSQL clients, WAT periods and retention using an isolated test schema. Database tests require `TEST_DATABASE_URL`; CI requires them to run.
