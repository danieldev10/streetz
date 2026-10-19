import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export type LivePaymentRevenue = {
  ticketRevenueKobo: number;
  subscriptionRevenueKobo: number;
};

/** Gross successful NGN receipts, excluding test/unknown payments and reversed payments.
 * Combined checkouts contribute their recorded portions, never the full charge to both totals.
 */
export async function getLivePaymentRevenue(prisma: Pick<PrismaService, "$queryRaw">): Promise<LivePaymentRevenue> {
  const [totals] = await prisma.$queryRaw<Array<{
    ticketRevenueKobo: bigint;
    subscriptionRevenueKobo: bigint;
  }>>(Prisma.sql`
    WITH live_payments AS (
      SELECT
        purpose,
        "amountKobo"::bigint AS amount,
        CASE WHEN "providerMetadata" ->> 'ticketAmountKobo' ~ '^[0-9]{1,10}$'
          THEN ("providerMetadata" ->> 'ticketAmountKobo')::bigint END AS ticket_amount,
        CASE WHEN "providerMetadata" ->> 'membershipAmountKobo' ~ '^[0-9]{1,10}$'
          THEN ("providerMetadata" ->> 'membershipAmountKobo')::bigint END AS membership_amount
      FROM "Payment"
      WHERE provider = 'paystack'
        AND status = 'SUCCESS'
        AND COALESCE(
          NULLIF(LOWER("providerMetadata" ->> 'domain'), ''),
          NULLIF(LOWER("providerMetadata" #>> '{paystack,domain}'), '')
        ) = 'live'
        AND COALESCE(
          NULLIF(UPPER("providerMetadata" #>> '{paystack,currency}'), ''),
          NULLIF(UPPER("providerMetadata" ->> 'currency'), ''),
          'NGN'
        ) = 'NGN'
    )
    SELECT
      COALESCE(SUM(CASE
        WHEN purpose = 'EVENT_TICKET' THEN amount
        WHEN purpose = 'MEMBERSHIP_EVENT_TICKET' AND ticket_amount + membership_amount = amount
          THEN ticket_amount
        ELSE 0 END), 0)::bigint AS "ticketRevenueKobo",
      COALESCE(SUM(CASE
        WHEN purpose = 'SUBSCRIPTION' THEN amount
        WHEN purpose = 'MEMBERSHIP_EVENT_TICKET' AND ticket_amount + membership_amount = amount
          THEN membership_amount
        ELSE 0 END), 0)::bigint AS "subscriptionRevenueKobo"
    FROM live_payments
  `);

  const ticketRevenueKobo = Number(totals?.ticketRevenueKobo ?? 0n);
  const subscriptionRevenueKobo = Number(totals?.subscriptionRevenueKobo ?? 0n);
  if (!Number.isSafeInteger(ticketRevenueKobo) || !Number.isSafeInteger(subscriptionRevenueKobo)) {
    throw new RangeError("Revenue total exceeds the supported amount.");
  }
  return { ticketRevenueKobo, subscriptionRevenueKobo };
}
