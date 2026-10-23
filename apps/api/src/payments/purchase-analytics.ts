import { createHash } from "crypto";

/** A minimal receipt for optional browser analytics. Never expose a Paystack
 * reference, ticket code, customer, address or payment-provider payload. */
export function purchaseAnalytics(
  payment: { id: string; amountKobo: number; purpose: string; status: string; providerMetadata: unknown },
  tickets: Array<{ eventId: string; status: string }>,
) {
  const metadata = asObject(payment.providerMetadata);
  const provider = asObject(metadata.paystack ?? metadata);
  if (payment.status !== "SUCCESS" || metadata.refundRequired === true ||
      provider.domain !== "live" || provider.currency !== "NGN" || provider.status !== "success" ||
      provider.amount !== payment.amountKobo || !Number.isSafeInteger(payment.amountKobo) || payment.amountKobo <= 0 ||
      !["EVENT_TICKET", "MEMBERSHIP_EVENT_TICKET"].includes(payment.purpose) ||
      !tickets.length || tickets.some((ticket) => !["PAID", "CHECKED_IN"].includes(ticket.status))) return undefined;
  const eventId = tickets[0].eventId;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(eventId) || tickets.some((ticket) => ticket.eventId !== eventId)) return undefined;
  return {
    eventId: `ccl_${createHash("sha256").update(`purchase:${payment.id}`).digest("hex")}`,
    contentId: eventId,
    value: payment.amountKobo / 100,
    currency: "NGN" as const,
    quantity: tickets.length,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
