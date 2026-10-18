# Paystack live payments

The existing checkout supports Paystack test and live keys. Switching to live is a production configuration change; it does not require a new SDK, a database migration, or a Vercel payment key.

## What is already implemented

- The API initializes checkout on Paystack and redirects the customer to the returned authorization URL.
- The API verifies payment status, the recorded amount, and NGN currency before granting membership or paid tickets.
- The webhook validates the raw request with HMAC-SHA512 using `PAYSTACK_SECRET_KEY` and acknowledges accepted events with HTTP 200.
- Database transactions protect against duplicate settlement when callbacks, webhooks, and the worker verify the same payment.
- The worker reconciles pending payments and sends ticket emails from the durable queue.

These are code-review findings. They do not confirm that the production services currently have the correct keys or that a live payment has been received.

## Production settings

In the **Crushclub production Railway project**, set these on both the API service and the production worker. A shared variable or a worker reference to the API value can keep the key consistent.

```env
PAYSTACK_SECRET_KEY=sk_live_REPLACE_WITH_YOUR_LIVE_SECRET
WEB_APP_URL=https://crushclub.ng
```

Enter the real secret directly in Railway. It must remain server-side. The current code does not read `PAYSTACK_PUBLIC_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, or `PAYSTACK_WEBHOOK_SECRET`. Webhook signatures use the same Paystack secret as API requests.

Keep `sk_test_...` on the staging API and staging worker. Both environments can use `NODE_ENV=production`: that setting controls Node/Nest behavior, while the Paystack key selects the payment environment.

In the Paystack dashboard, open **Settings → API Keys & Webhooks → Live Mode** and save:

| Setting | Value |
| --- | --- |
| Live webhook URL | `https://crushclub.up.railway.app/api/payments/paystack/webhook` |
| Live callback URL | `https://crushclub.ng/payment/callback` |

The API hostname above is the production hostname recorded in this repository. If production Railway now uses a different public hostname, use that hostname with the same webhook path. The webhook belongs to the API service; the worker does not expose this route.

The API also supplies a callback URL for each checkout, including the event ID and payment purpose. Keep that behavior intact.

## Switch and verify

1. Let current test checkouts finish before switching the production API and worker to the same live secret. Redeploy both services and confirm their readiness checks pass.
2. Save the live webhook and callback settings in Paystack. A callback redirect alone is not proof of payment: fulfillment still depends on server verification.
3. Complete an owner-controlled, low-value live purchase through the normal site checkout. This requires a real payment; this guide and the automated tests do not initiate one.
4. Confirm the transaction is successful in **Paystack Live Mode**, the site shows the correct ticket or membership, the ticket email arrives, and the ticket can be downloaded and checked in.
5. Confirm Paystack's webhook delivery receives HTTP 200. Reload the callback for the same reference and confirm it does not create a second ticket or grant membership twice.
6. Check worker and API logs for payment reconciliation failures, failed ticket emails, and `payment_refund_required` events.

The direct webhook has no browser-origin requirement or customer login requirement. It requires a valid Paystack signature. Opening it as a browser GET is not a webhook test.

## What changes for customers and operations

- Paid checkout collects real money, with Paystack's live fees and settlement rules. Settlement and the receiving bank account are managed in the Paystack dashboard.
- Current membership pricing remains **₦1,000 for 30 days**. Checkout adds membership when the buyer does not already have an active membership, including combined membership-and-ticket checkout. This is not an automatic recurring subscription.
- Guest free-ticket bookings still have no Paystack charge. An authenticated checkout without an active membership may include the membership charge even when the event ticket itself is free.
- Test transactions do not become live payments. Existing test-created memberships, tickets, and payment records in the production database remain there; review them separately before relying on revenue metrics or admission lists. Do not assume switching keys removes test data.
- Pending test references cannot be reconciled using the live key. Record and review any remaining test payment jobs separately; avoid mass deleting reservations or historical records.
- A payment arriving after its reservation becomes unavailable follows the existing refund-required path. The code flags and logs the case; it **does not automatically issue a Paystack refund**. Refunds must be handled by the operator through Paystack until a refund workflow is implemented.

## Check live payment records in Supabase

Open the **production** Supabase project, then **SQL Editor**. Save these two
queries as separate snippets and click **Run** whenever an updated report is
needed:

- [`scripts/sql/live-payment-history.sql`](../scripts/sql/live-payment-history.sql)
  lists live payment attempts, buyer emails, purpose, status, amounts, currency,
  reference, and initiation/payment times in WAT. Uncomment its `SUCCESS` filter
  to show only successful payments.
- [`scripts/sql/live-payment-summary.sql`](../scripts/sql/live-payment-summary.sql)
  shows totals and a breakdown by purchase type, with separate currency totals.
  Only successful records contribute to the gross successful amount.

Both scripts contain only `SELECT` queries; they do not modify records or create
public database views. They check the Paystack `domain` field in both metadata
formats used by the application: top-level verification data for subscriptions
and nested `paystack` data for ticket checkouts. No hardcoded start date is
needed. Test payments and records without a saved environment are excluded;
`SUCCESS` alone is not evidence that a payment was live.

The payment time can be empty for an unfinished checkout. A deleted account may
appear as `Deleted member`; the payer email is taken from retained Paystack
transaction data where available. Gross successful amounts do not deduct
Paystack fees or refunds and are not bank settlement balances. These reports
reflect records already saved by the application; they do not contact Paystack
to reconcile missing or unresolved transactions.

## Provider references

- [Paystack API environments and authentication](https://paystack.com/docs/api/): the same API base URL serves test and live; the key selects the environment.
- [Paystack API keys and dashboard webhook settings](https://support.paystack.com/en/articles/2123458).
- [Paystack webhook signatures and delivery](https://paystack.com/docs/payments/webhooks/).
- [Paystack payment verification](https://paystack.com/docs/payments/verify-payments/).
