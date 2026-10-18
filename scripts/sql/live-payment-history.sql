-- Run in the PRODUCTION Supabase project's SQL Editor.
-- Read-only: includes only records explicitly marked live by Paystack.
-- Run again at any time; no date needs changing.
SELECT
  to_char(
    p."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos',
    'YYYY-MM-DD HH24:MI:SS'
  ) AS initiated_at_wat,
  to_char(
    COALESCE(
      NULLIF(p."providerMetadata" #>> '{paystack,paid_at}', ''),
      NULLIF(p."providerMetadata" ->> 'paid_at', ''),
      NULLIF(p."providerMetadata" #>> '{paystack,paidAt}', ''),
      NULLIF(p."providerMetadata" ->> 'paidAt', '')
    )::timestamptz AT TIME ZONE 'Africa/Lagos',
    'YYYY-MM-DD HH24:MI:SS'
  ) AS paid_at_wat,
  u."displayName" AS account_name,
  COALESCE(
    p."providerMetadata" #>> '{paystack,customer,email}',
    p."providerMetadata" #>> '{customer,email}',
    u.email
  ) AS payer_email,
  p.purpose,
  p.status,
  ROUND(p."amountKobo"::numeric / 100, 2) AS amount,
  COALESCE(
    p."providerMetadata" #>> '{paystack,currency}',
    p."providerMetadata" ->> 'currency',
    'NGN'
  ) AS currency,
  p."providerReference" AS reference,
  COALESCE(p."providerMetadata" ->> 'refundRequired', 'false') AS refund_required
FROM public."Payment" p
LEFT JOIN public."User" u ON u.id = p."userId"
WHERE p.provider = 'paystack'
  AND COALESCE(
    NULLIF(LOWER(p."providerMetadata" ->> 'domain'), ''),
    NULLIF(LOWER(p."providerMetadata" #>> '{paystack,domain}'), '')
  ) = 'live'
  -- For successful payments only, uncomment the next line:
  -- AND p.status = 'SUCCESS'
ORDER BY p."createdAt" DESC, p.id DESC;
