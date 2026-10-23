const test = require("node:test");
const assert = require("node:assert/strict");
const { purchaseAnalytics } = require("../dist/src/payments/purchase-analytics.js");
const payment = { id: "internal-payment", amountKobo: 2_500_000, purpose: "EVENT_TICKET", status: "SUCCESS",
  providerMetadata: { ticketAmountKobo: 1_500_000, membershipAmountKobo: 1_000_000, paystack: { domain: "live", currency: "NGN", amount: 2_500_000, status: "success", customer: { email: "private@example.invalid" } }, ticketIds: ["private-ticket"] } };
const tickets = [{ eventId: "public-event", status: "PAID" }, { eventId: "public-event", status: "CHECKED_IN" }];
test("only fulfilled live payments produce a minimal stable purchase receipt in naira", () => {
  const receipt = purchaseAnalytics(payment, tickets);
  assert.match(receipt.eventId, /^ccl_[a-f0-9]{64}$/);
  assert.deepEqual(receipt, { eventId: receipt.eventId, contentId: "public-event", value: 25000, currency: "NGN", quantity: 2 });
  assert.deepEqual(purchaseAnalytics(payment, tickets), receipt);
  assert.equal(purchaseAnalytics({ ...payment, purpose: "MEMBERSHIP_EVENT_TICKET" }, tickets).value, 25000);
  assert.equal(purchaseAnalytics({ ...payment, purpose: "MEMBERSHIP_EVENT_TICKET", providerMetadata: {
    ...payment.providerMetadata, ticketAmountKobo: 0, membershipAmountKobo: payment.amountKobo,
  } }, tickets), undefined, "membership payment with a free ticket is not a paid ticket conversion");
  for (const patch of [{ status: "PENDING" }, { status: "FAILED" }, { status: "REFUNDED" }, { purpose: "SUBSCRIPTION" }, { amountKobo: 0 }]) {
    assert.equal(purchaseAnalytics({ ...payment, ...patch }, tickets), undefined);
  }
  for (const patch of [{ domain: "test" }, { domain: undefined }, { currency: "USD" }, { status: "failed" }, { amount: 100 }]) {
    assert.equal(purchaseAnalytics({ ...payment, providerMetadata: { paystack: { ...payment.providerMetadata.paystack, ...patch } } }, tickets), undefined);
  }
  assert.equal(purchaseAnalytics({ ...payment, providerMetadata: { ...payment.providerMetadata, refundRequired: true } }, tickets), undefined);
  assert.equal(purchaseAnalytics(payment, []), undefined);
  assert.equal(purchaseAnalytics(payment, [{ eventId: "public-event", status: "RESERVED" }]), undefined);
  assert.equal(purchaseAnalytics(payment, [{ eventId: "public-event", status: "CANCELLED" }]), undefined);
});
