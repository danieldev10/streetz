const assert = require("node:assert/strict");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Prisma, PrismaClient, PaymentPurpose, PaymentStatus } = require("@prisma/client");
const { AdminService } = require("../dist/src/admin/admin.service.js");
const { getLivePaymentRevenue } = require("../dist/src/admin/live-payment-revenue.js");

test("metrics expose live ticket and subscription totals as JSON-safe amounts", async () => {
  const count = async () => 0;
  const service = new AdminService({
    user: { count }, profile: { count }, match: { count }, chatRoom: { count },
    roomMembership: { count }, chatMessage: { count }, event: { count }, ticket: { count }, userReport: { count },
    getPoolMetrics: () => ({}),
    $queryRaw: async () => [{ ticketRevenueKobo: 510000n, subscriptionRevenueKobo: 500000n }]
  }, {}, {});

  const result = await service.getMetrics();
  assert.deepEqual(result.revenue, { ticketRevenueKobo: 510000, subscriptionRevenueKobo: 500000 });
  assert.equal(result.events.ticketRevenueKobo, result.revenue.ticketRevenueKobo);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("revenue totals cannot silently lose integer precision", async () => {
  await assert.rejects(() => getLivePaymentRevenue({
    $queryRaw: async () => [{ ticketRevenueKobo: BigInt(Number.MAX_SAFE_INTEGER) + 1n, subscriptionRevenueKobo: 0n }]
  }), /exceeds the supported amount/);
});

test("database totals exclude test/unknown payments and allocate combined live checkouts once", {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const ticket = PaymentPurpose.EVENT_TICKET;
  const subscription = PaymentPurpose.SUBSCRIPTION;
  const combined = PaymentPurpose.MEMBERSHIP_EVENT_TICKET;
  const payment = (purpose, amountKobo, providerMetadata, extra = {}) => ({
    purpose, amountKobo, providerMetadata, status: PaymentStatus.SUCCESS, provider: "paystack", ...extra
  });
  const excludedAmount = 90000000;
  const rows = [
    payment(ticket, 120000, { domain: "live", currency: "NGN" }, { createdAt: new Date("2026-01-01T00:00:00Z") }),
    payment(ticket, 80000, { paystack: { domain: "live", currency: "NGN" } }),
    payment(subscription, 100000, { domain: "live", currency: "NGN" }),
    payment(subscription, 100000, { paystack: { domain: "live", currency: "NGN" } }),
    payment(ticket, 50000, { domain: "LIVE", currency: "ngn" }),
    payment(ticket, 10000, { domain: "", paystack: { domain: "live" } }),
    payment(combined, 300000, { paystack: { domain: "live" }, ticketAmountKobo: 200000, membershipAmountKobo: 100000 }),
    payment(combined, 100000, { paystack: { domain: "live" }, ticketAmountKobo: 0, membershipAmountKobo: 100000 }),
    payment(combined, 150000, { paystack: { domain: "live" }, ticketAmountKobo: "50000", membershipAmountKobo: "100000" }),
    ...[ticket, subscription, combined].flatMap((purpose) => [
      payment(purpose, excludedAmount, { domain: "test" }, { createdAt: new Date("2026-01-01T00:00:00Z") }),
      payment(purpose, excludedAmount, { paystack: { domain: "test" } }, { createdAt: new Date("2099-01-01T00:00:00Z") }),
      payment(purpose, excludedAmount, { domain: "test", paystack: { domain: "live" } }),
      payment(purpose, excludedAmount, null),
      payment(purpose, excludedAmount, {}),
      payment(purpose, excludedAmount, "live"),
      payment(purpose, excludedAmount, undefined),
      payment(purpose, excludedAmount, { domain: "live", currency: "USD" }),
      payment(purpose, excludedAmount, { paystack: { domain: "live", currency: "GHS" } }),
      payment(purpose, excludedAmount, { domain: "live" }, { provider: "manual" }),
      ...[PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.ABANDONED, PaymentStatus.REVERSED]
        .map((status) => payment(purpose, excludedAmount, { domain: "live" }, { status }))
    ]),
    ...[
      {}, { ticketAmountKobo: -1, membershipAmountKobo: excludedAmount + 1 },
      { ticketAmountKobo: "bad", membershipAmountKobo: 0 },
      { ticketAmountKobo: "9".repeat(100), membershipAmountKobo: 0 },
      { ticketAmountKobo: 100000, membershipAmountKobo: excludedAmount },
      { ticketAmountKobo: 100000.5, membershipAmountKobo: excludedAmount - 100000.5 }
    ].map((split) => payment(combined, excludedAmount, { paystack: { domain: "live" }, ...split }))
  ];

  try {
    await prisma.$transaction(async (transaction) => {
      // Each connection gets its own temporary ledger, isolated from other CI tests.
      await transaction.$executeRaw`CREATE TEMP TABLE "Payment" (LIKE public."Payment" INCLUDING DEFAULTS) ON COMMIT DROP`;
      assert.deepEqual(await getLivePaymentRevenue(transaction), { ticketRevenueKobo: 0, subscriptionRevenueKobo: 0 });
      const values = rows.map((row, index) => Prisma.sql`(
        ${`revenue-${index}`}, ${"fixture-user"}, ${row.purpose}::"PaymentPurpose", ${row.status}::"PaymentStatus",
        ${row.amountKobo}, ${row.provider}, ${`reference-${index}`},
        ${row.providerMetadata === undefined ? Prisma.sql`NULL` : Prisma.sql`${JSON.stringify(row.providerMetadata)}::jsonb`},
        ${row.createdAt ?? new Date("2026-10-19T00:00:00Z")}, ${new Date("2026-10-19T00:00:00Z")}
      )`);
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "Payment" (id, "userId", purpose, status, "amountKobo", provider, "providerReference", "providerMetadata", "createdAt", "updatedAt")
        VALUES ${Prisma.join(values)}
      `);
      assert.deepEqual(await getLivePaymentRevenue(transaction), {
        ticketRevenueKobo: 510000,
        subscriptionRevenueKobo: 500000
      });
    }, { timeout: 15000 });
  } finally {
    await prisma.$disconnect();
  }
});
