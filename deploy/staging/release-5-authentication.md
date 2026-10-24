# Release 5: authentication and abuse controls

This release keeps access tokens in browser memory, coordinates cookie rotation between tabs, checks browser origins on cookie authentication, and shares HTTP and private realtime rate limits through the existing Redis service. It does not change the database schema or require another worker, Redis volume, AWS resource, or queue encryption key.

## Session behavior

- Login/register commit the session inside the same lock used for refresh/logout. Reload restores it using the existing HTTP-only refresh cookie. The browser removes legacy `streetz_access_token` and `access_token` localStorage entries.
- Tabs use Web Locks to serialize cookie requests. Browsers without Web Locks use separate localStorage lock claims with bounded waits and expiring leases. Only random revision IDs and lock metadata are persisted; user data and access tokens are not persisted or broadcast.
- Login/logout revisions clear old account state across tabs. Private React Query requests are cancelled and cached private data removed. Late responses cannot restore a logged-out session or update a different account.
- Logout clears browser state immediately. A persisted logout marker prevents an offline logout from restoring the still-present cookie after reload. Online logout also revokes the current database refresh token and clears its cookie. An offline logout cannot revoke a server session until a network request succeeds; another browser/device is unaffected.
- Temporary network/503 failures preserve memory credentials and retry restoration. An authoritative 401 clears the session. Anonymous tabs stop polling refresh after a 401 until a new login revision.
- Payment return pages wait for cookie restoration instead of reading a saved bearer. Private sockets read the current memory token for each handshake. The server expires sockets at JWT expiry and checks expiry and shared action budgets before joins/sends. The client refreshes and reconnects; existing components rejoin their conversation/room.

Access-token expiry remains 15 minutes by default. Logout does not add a server-side blacklist for already-issued JWTs. In-memory credentials reduce persistent theft; active malicious JavaScript running on the same origin can still access the session or issue requests. Persisting the offline logout marker requires writable browser storage; if storage is blocked, Web Locks and the channel can coordinate open tabs but cannot preserve that marker through reload. Without either Web Locks or writable storage, cookie requests fail safely with 503. The fallback cannot promise perfect exclusion if a browser suspends a tab longer than its 60-second lease; cookie requests have a 15-second fetch timeout and fallback claims wait at most 30 seconds. Validate real devices before rollout.

## Required settings

Keep existing database, Redis, JWT, media, payment, email, worker and Sentry settings. Keep staging/production resources isolated. Do not rotate JWT or job encryption secrets as part of this release.

| Service | Variable | Value |
| --- | --- | --- |
| Vercel staging | NEXT_PUBLIC_API_URL | `/api` |
| Vercel staging | API_PROXY_TARGET / API_SERVER_URL | Existing staging Railway HTTPS API |
| Vercel staging | NEXT_PUBLIC_SOCKET_URL | Existing staging Railway HTTPS API, no /api suffix |
| Vercel staging | CSP_MODE | `report-only` initially |
| Vercel staging | NEXT_PUBLIC_MEDIA_CDN_BASE_URL | Existing staging CloudFront HTTPS origin |
| Vercel staging | NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN | Staging media bucket's HTTPS S3 origin, e.g. https://BUCKET.s3.eu-west-1.amazonaws.com; required before CSP enforcement for direct uploads |
| Railway staging API | WEB_APP_URL | `https://staging.crushclub.ng` |
| Railway staging API | REFRESH_COOKIE_SAME_SITE | `lax` |
| Railway staging API | AUTH_ALLOWED_ORIGINS | Optional comma-separated exact website aliases for this environment; leave empty if unnecessary |

Use Vercel's same-origin `/api` rewrite for cookie authentication, especially for mobile Safari. Cookies are host-only, HTTP-only, Secure under NODE_ENV=production, and scoped to /api/auth. Existing configurations that explicitly set SameSite=None should switch to lax with the proxy. None remains supported for deliberate cross-site clients but requires Secure and can be blocked by third-party cookie policies.

The API accepts exact WEB_APP_URL/alias origins, or a trusted Referer when Origin is absent. Origin=null, missing sources, wildcard aliases and suffix lookalikes are rejected. Login/register/refresh/logout require the new X-Crushclub-Client: web header or application/json for older cached clients, and return Cache-Control: no-store. CORS alone cannot prevent a simple POST from changing state; source validation is enforced on the route. This follows [OWASP's CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Scripts/tools calling these browser auth endpoints must supply a trusted Origin and JSON or the client header explicitly.

Additional origins belong only to the relevant environment. Do not allow all Vercel previews, wildcard subdomains, arbitrary incoming Host headers, or the staging website on the production cookie endpoints. WebSocket upgrades check supplied browser origins as well as HTTP CORS; native socket clients without Origin still need bearer authentication on private namespaces.

## Shared protection

The current per-route HTTP/IP budgets remain in place, with counters moved from process memory to Redis. Additional email budgets survive changes of IP/API replica:

| Action | Shared budget |
| --- | --- |
| Login | 15 attempts per normalized email per minute, alongside the existing 5/minute route/IP limit |
| Registration | 5 per email per 15 minutes |
| Password-reset request | 3 per email per 15 minutes |
| Guest-ticket code request | 5 per email per 15 minutes |
| Private socket sends | 30 per user per minute, across their private sockets |
| Private socket joins/leaves | 60 per user per minute |

Counter keys use HMAC digests, not raw email/IP/user IDs. Blocks expire rather than extending on every blocked request. HTTP blocks return 429/Retry-After. Redis failure returns bounded 503 rather than silently bypassing protection. API readiness includes the protection client's state; liveness/health endpoints retain their throttle exemption. The worker's own health/queue processing is unchanged.

The API has one additional Redis client for these counters. Production/staging API replicas must use the same Redis and JWT_ACCESS_SECRET for shared counters. Flushing Redis or rotating the signing secret resets counter windows. Store failures emit the safe `rate_limit_store_unavailable` event; alert on repeated 503/readiness failures and sustained excessive 429s.

Express retains the existing trust-proxy setting of one hop. Confirm actual client IPs in staging through both Vercel's rewrite and direct Railway requests, including requests with a forged X-Forwarded-For header. If the proxy topology makes every browser appear as one proxy, or trusts an attacker-supplied address, correct that topology/configuration before relying on IP budgets. The per-email and per-user budgets are independent of client IP.

## CSP rollout

CSP defaults to Content-Security-Policy-Report-Only. Its source list includes configured API/socket/media/Sentry origins, Paystack, Google Maps and Giphy. The retired identity SDK's model/WASM/streaming endpoints and WASM evaluation exception have been removed.

Sentry receives at most ten unique directive/disposition reports per page. Reports omit document URLs, blocked URLs, private query strings, referrers, samples, users, breadcrumbs and extra context. Inspect the browser console locally to identify a missing legitimate source; monitoring intentionally does not receive the URL. Keep additions narrowly scoped to known integrations.

After all staging journeys below work and reports have been reviewed, set CSP_MODE=enforce and rebuild the staging website. Report-only itself blocks nothing. Next.js static hydration still requires unsafe-inline in this first policy; enforcement limits external sources and framing but does not fully prevent inline XSS. A nonce/hash rendering strategy is a separate change, with a static-rendering/performance tradeoff described in [Next.js's CSP documentation](https://nextjs.org/docs/app/guides/content-security-policy). CSP_MODE=off is the emergency policy rollback.

## Deployment and acceptance order

1. Record current API/web deployment IDs. Get passing Release checks for this commit. No migration is needed.
2. Set staging variables above, then deploy the website followed by the API from the same tested commit. Retain Railway/Vercel CI gates and readiness settings. Older bundles can still call auth through JSON plus origin checks. Close/reload all older website tabs for the memory-token transition: removing their legacy stored token triggers the old code's logout listener, so a one-time fresh login may be needed during this migration.
3. Test login, register, page reload, a new tab, logout, logout in another tab, switching accounts, and a deliberately expired session. No private cache or old pending response should appear in the next account.
4. Open several tabs and reload them together; leave them through access-token expiry. Confirm they restore without a false logout. Test network loss/recovery and logout while offline, then reload.
5. On a real iPhone in Safari, repeat reload/multiple-tab/logout and verify no third-party-cookie dependency. Automated fallback tests are not a substitute for Safari device testing.
6. Test direct messages, rooms, alerts, reconnect after network loss/expiry, and guest read-only rooms. Verify socket cleanup does not reconnect after leaving a page.
7. Test Paystack's paid ticket/membership return, free/guest tickets, photo uploads, Google Maps, and GIF search. Keep the worker delivering emails. Review policy reports, then repeat with staging CSP_MODE=enforce.
8. Confirm shared 429s across API replicas/different IPs and readiness/503 during a controlled staging protection-client failure. Do not intentionally disrupt production Redis for this exercise.
9. After staging acceptance, promote the tested code to main and use production URLs. Deploy web then API. Keep CSP in report-only until production integration reports are reviewed.

## Rollback and limits

Roll API and website back together to recorded compatible deployments if session behavior regresses. Cookies retain their name/path; rollback does not need database changes or secret rotation. Old website code may resume persisting access tokens, so restore the release after resolving the cause. To address a CSP-only issue, use report-only/off and rebuild without rolling back authentication.

Local validation on 10 October 2026: 112 API tests, 20 frontend tests, and four operational tests passed with zero skips. API lint/build and web lint/type checking/production build passed. Tests covered real PostgreSQL refresh races and logout, two HTTP replicas sharing Redis counters, socket expiry, protection-client failure/recovery, simulated cross-tab coordination with/without Web Locks, stale responses, and CSP privacy. A built Next.js process proxying to a local API confirmed Origin forwarding, cookie rotation, logout, no-store and report-only CSP headers. Tests use synthetic accounts and disposable local services, not customer data.

These checks run in CI as well. This document's real-device, provider-proxy and deployed staging checks remain release acceptance tasks; local passing tests do not claim those have been performed.
