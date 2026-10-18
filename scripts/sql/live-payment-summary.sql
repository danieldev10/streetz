-- Run separately in the PRODUCTION Supabase project's SQL Editor.
-- Read-only. Only SUCCESS contributes to gross successful amounts.
-- Currency totals are kept separate. Amounts do not deduct fees/refunds.
WITH live_payments AS (
  SELECT
    p.purpose,
    p.status,
    p."amountKobo" AS amount_kobo,
    COALESCE(
      p."providerMetadata" #>> '{paystack,currency}',
      p."providerMetadata" ->> 'currency',
      'NGN'
    ) AS currency
  FROM public."Payment" p
  WHERE p.provider = 'paystack'
    AND COALESCE(
      NULLIF(LOWER(p."providerMetadata" ->> 'domain'), ''),
      NULLIF(LOWER(p."providerMetadata" #>> '{paystack,domain}'), '')
    ) = 'live'
)
SELECT
  currency,
  COALESCE(purpose::text, 'ALL PURCHASES') AS purchase_type,
  COUNT(*) AS payment_attempts,
  COUNT(*) FILTER (WHERE status = 'SUCCESS') AS successful_payments,
  ROUND(
    COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'SUCCESS'), 0)::numeric / 100,
    2
  ) AS gross_successful_amount,
  COUNT(*) FILTER (WHERE status = 'ABANDONED') AS abandoned_checkouts,
  COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_payments,
  COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_payments,
  COUNT(*) FILTER (WHERE status = 'REVERSED') AS reversed_payments
FROM live_payments
GROUP BY currency, ROLLUP(purpose)
ORDER BY currency, GROUPING(purpose) DESC, purpose;
