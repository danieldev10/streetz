const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { PaymentPurpose, PaymentStatus, SubscriptionStatus } = require("@prisma/client");
const { PaymentsService } = require("../dist/src/payments/payments.service.js");

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test("a successful subscription payment grants membership only once", async () => {
  const payment = {
    id: "payment-1",
    userId: "user-1",
    purpose: PaymentPurpose.SUBSCRIPTION,
    status: PaymentStatus.PENDING,
    amountKobo: 100_000,
    providerReference: "STZSUB-test",
    providerMetadata: null,
    user: {
      id: "user-1",
      subscriptionStatus: SubscriptionStatus.INACTIVE,
      subscriptionEndsAt: null
    }
  };
  let membershipUpdates = 0;
  const transaction = {
    $queryRaw: async () => [],
    payment: {
      findUniqueOrThrow: async () => payment,
      update: async ({ data }) => {
        Object.assign(payment, data);
        return payment;
      }
    },
    user: {
      update: async ({ data }) => {
        membershipUpdates += 1;
        Object.assign(payment.user, data);
        return payment.user;
      }
    }
  };
  const prisma = {
    payment: {
      findUnique: async () => payment
    },
    $transaction: async (callback) => callback(transaction)
  };
  const config = {
    getOrThrow(key) {
      if (key === "PAYSTACK_SECRET_KEY") return "test-secret";
      throw new Error(`Unexpected configuration key: ${key}`);
    }
  };
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: true,
      message: "Verification successful",
      data: {
        reference: payment.providerReference,
        status: "success",
        amount: payment.amountKobo,
        currency: "NGN"
      }
    })
  });

  const service = new PaymentsService(prisma, config);
  const first = await service.verifySubscriptionPayment(payment.userId, payment.providerReference);
  const firstExpiry = first.subscriptionEndsAt;
  const second = await service.verifySubscriptionPayment(payment.userId, payment.providerReference);

  assert.equal(first.status, PaymentStatus.SUCCESS);
  assert.equal(second.status, PaymentStatus.SUCCESS);
  assert.equal(membershipUpdates, 1);
  assert.deepEqual(second.subscriptionEndsAt, firstExpiry);
});
