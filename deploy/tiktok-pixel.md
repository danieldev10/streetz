# TikTok Pixel

The web app uses public pixel `DBDN6URC77UFSQ3BRQOG` on `crushclub.ng` and
`www.crushclub.ng`. There are no Railway variables, secrets or database
migrations for this integration. `NEXT_PUBLIC_TIKTOK_PIXEL_ID` can optionally
override the public ID at web build time. Staging/preview/local hostnames never
load the pixel or queue events for this production ID.

## TikTok Ads Manager

In Events Manager, select this pixel, finish the **Pixel only** setup, and leave
Automatic Advanced Matching and automatic/event-builder events off. Events are
sent by the app; do not install another copy through a tag manager or paste the
base snippet into another layout. No Events API access token has been configured.

Use **Test Events** or TikTok Pixel Helper on a public production event page.
Accept optional cookies for that test. Pageview and ViewContent should appear.
Rejecting optional cookies must produce no pixel request. Withdraw consent via
Privacy Policy → Cookie preferences. Do not make a live payment solely to test
analytics; verify Purchase when the next genuine buyer completes checkout.

## Events and boundaries

- `Pageview`: public `/events` and `/events/:id` pages after consent.
- `ViewContent`: a loaded public event detail, excluding missing events and
  admin/ticket-management views. Contains the public event ID only.
- `InitiateCheckout`: a successfully initialized paid ticket checkout. Amounts
  are NGN naira, with quantity. Opening the ticket modal is not a checkout event.
- `CompleteRegistration`: successful account creation, never login.
- `Purchase`: a backend-confirmed, fulfilled **live** Paystack ticket payment,
  excluding test/unknown domains, free bookings, pending/failed payments and
  refund-required payments. Combined membership/ticket checkout reports the
  whole actual charge once. No separate subscription conversion is sent yet.

Registration, checkout and purchase signals originating on private/auth/callback
pages wait in this tab for the next public event page (up to 30 minutes). They
are only saved when consent was already granted. This avoids loading advertising
code beside credentials or exposing callback/guest URLs. A user who never
returns to a public event page will not be counted. Browser blocking, consent
rejection, closed tabs and network loss can also undercount; this is not the
financial ledger. A future consent-aware Events API release can address browser
delivery gaps and must share event IDs for deduplication.

Purchase IDs are stable hashes of internal payment IDs. A bounded local ledger
and TikTok `event_id` prevent normal callback reload/back-button repeats. Local
data has no account identity, email, ticket code, payment reference or venue.
Clearing browser storage removes the local deduplication history.

The SDK is deferred until affirmative consent and a public event route. Its
automatic form collection and history observation are disabled. Moving to a
private route after SDK loading uses a fresh document, and consent withdrawal
revokes the SDK, clears accessible TikTok cookies and reloads. Origin-only
referrers prevent private paths/query strings becoming referral data.

## Verification

`apps/web/test/marketing.test.cjs` covers consent, route restrictions, staging
isolation, money validation, replay deduplication and storage failures.
`apps/api/test/purchase-analytics.test.js` covers live/test domains, fulfillment,
refunds and the minimal purchase receipt. Existing ticket-delivery and payment
tests still verify settlement and email behavior. Browser verification uses a
fresh context, synthetic API responses and intercepted TikTok collection traffic;
it must never submit fake conversions to the real ad account.
