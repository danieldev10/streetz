const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { afterEach, test } = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const {
  EventKind,
  EventStatus,
  PaymentPurpose,
  PaymentStatus,
  PrismaClient,
  RaffleEntryStatus,
  RaffleStatus,
  SubscriptionStatus,
  TicketStatus,
} = require("@prisma/client");
const { PaymentsService } = require("../dist/src/payments/payments.service.js");
const { RafflesService } = require("../dist/src/raffles/raffles.service.js");
const { AdminService } = require("../dist/src/admin/admin.service.js");

const connectionString = process.env.TEST_DATABASE_URL;
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function createClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function config(secret = "paystack-test-secret") {
  return {
    get(key) {
      if (key === "EVENT_TICKET_RESERVATION_MINUTES") return "15";
      return undefined;
    },
    getOrThrow(key) {
      if (key === "PAYSTACK_SECRET_KEY") return secret;
      if (key === "WEB_APP_URL") return "http://localhost:3000";
      throw new Error(`Unexpected configuration key: ${key}`);
    },
  };
}

function mockSuccessfulPaystack(amountByReference) {
  global.fetch = async (url) => {
    const reference = decodeURIComponent(String(url).split("/").at(-1));
    const amount = amountByReference.get(reference);
    assert.ok(amount, `Unexpected Paystack reference ${reference}`);
    return {
      ok: true,
      json: async () => ({
        status: true,
        message: "Verification successful",
        data: { reference, status: "success", amount, currency: "NGN" },
      }),
    };
  };
}

test("two buyers competing for the final event ticket cannot oversell", { skip: !connectionString }, async () => {
  const prisma = createClient();
  const competingPrisma = createClient();
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const users = await Promise.all(
    ["first", "second"].map((label) =>
      prisma.user.create({
        data: {
          email: `${label}-capacity-${unique}@example.com`,
          displayName: `${label} capacity`,
          passwordHash: "unused",
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEndsAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ),
  );
  const event = await prisma.event.create({
    data: {
      title: `Capacity race ${unique}`,
      slug: `capacity-race-${unique}`,
      category: "Community",
      kind: EventKind.STANDARD,
      venue: "Test venue",
      city: "Lagos",
      startsAt: new Date(Date.now() + 86_400_000),
      status: EventStatus.PUBLISHED,
      ticketTypes: { create: { name: "Regular", priceKobo: 2_500, capacity: 1, maxTicketsPerUser: 1 } },
    },
    include: { ticketTypes: true },
  });
  const firstService = new PaymentsService(prisma, config());
  const secondService = new PaymentsService(competingPrisma, config());

  try {
    const attempts = await Promise.allSettled([
      firstService.reserveEventTicketsForPayment(users[0].id, event.id, { quantity: 1 }, { allowFreeTickets: false }),
      secondService.reserveEventTicketsForPayment(users[1].id, event.id, { quantity: 1 }, { allowFreeTickets: false }),
    ]);
    const activeTickets = await prisma.ticket.count({
      where: { ticketTypeId: event.ticketTypes[0].id, status: TicketStatus.RESERVED },
    });

    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
    assert.equal(activeTickets, 1);
  } finally {
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await Promise.all([prisma.$disconnect(), competingPrisma.$disconnect()]);
  }
});

test("callback and webhook cannot activate an event payment twice", { skip: !connectionString }, async () => {
  const prisma = createClient();
  const competingPrisma = createClient();
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const secret = "paystack-event-concurrency-secret";
  const user = await prisma.user.create({
    data: {
      email: `event-race-${unique}@example.com`,
      displayName: "Event Race",
      passwordHash: "unused",
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionEndsAt: new Date(Date.now() + 86_400_000),
    },
  });
  const event = await prisma.event.create({
    data: {
      title: `Paid event race ${unique}`,
      slug: `paid-event-race-${unique}`,
      category: "Community",
      kind: EventKind.STANDARD,
      venue: "Test venue",
      city: "Lagos",
      startsAt: new Date(Date.now() + 86_400_000),
      status: EventStatus.PUBLISHED,
      ticketTypes: { create: { name: "Regular", priceKobo: 2_500, capacity: 1, maxTicketsPerUser: 1 } },
    },
    include: { ticketTypes: true },
  });
  const ticketType = event.ticketTypes[0];
  const ticket = await prisma.ticket.create({
    data: {
      eventId: event.id,
      userId: user.id,
      ticketTypeId: ticketType.id,
      code: `RACE-${unique}`,
      status: TicketStatus.RESERVED,
      reservedUntil: new Date(Date.now() + 900_000),
    },
  });
  const reference = `STZTIX-${unique}`;
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      purpose: PaymentPurpose.EVENT_TICKET,
      amountKobo: ticketType.priceKobo,
      providerReference: reference,
      providerMetadata: {
        eventId: event.id,
        ticketId: ticket.id,
        ticketIds: [ticket.id],
        ticketTypeId: ticketType.id,
        quantity: 1,
        ticketAmountKobo: ticketType.priceKobo,
      },
    },
  });
  mockSuccessfulPaystack(new Map([[reference, payment.amountKobo]]));
  const callbackService = new PaymentsService(prisma, config(secret));
  const webhookService = new PaymentsService(competingPrisma, config(secret));
  const rawBody = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference } }));
  const signature = createHmac("sha512", secret).update(rawBody).digest("hex");

  try {
    const results = await Promise.all([
      callbackService.verifyEventTicketPayment(user.id, reference),
      webhookService.handlePaystackWebhook(signature, rawBody, JSON.parse(rawBody.toString("utf8"))),
    ]);
    const [storedPayment, storedTicket, storedTicketType] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
      prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } }),
    ]);

    assert.equal(results[0].status, PaymentStatus.SUCCESS);
    assert.deepEqual(results[1], { received: true });
    assert.equal(storedPayment.status, PaymentStatus.SUCCESS);
    assert.equal(storedTicket.status, TicketStatus.PAID);
    assert.equal(storedTicketType.soldCount, 1);
  } finally {
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await Promise.all([prisma.$disconnect(), competingPrisma.$disconnect()]);
  }
});

test("concurrent raffle verification mints one entry set and grants bundled membership once", { skip: !connectionString }, async () => {
  const prisma = createClient();
  const competingPrisma = createClient();
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `raffle-race-${unique}@example.com`, displayName: "Raffle Race", passwordHash: "unused" },
  });
  const event = await prisma.event.create({
    data: {
      title: `Raffle race ${unique}`,
      slug: `raffle-race-${unique}`,
      category: "Raffle",
      kind: EventKind.RAFFLE,
      venue: "Online",
      city: "Lagos",
      startsAt: new Date(Date.now() + 172_800_000),
      status: EventStatus.PUBLISHED,
      raffleDraw: {
        create: {
          ticketPriceKobo: 1_000,
          salesStartsAt: new Date(Date.now() - 60_000),
          salesEndsAt: new Date(Date.now() + 86_400_000),
          drawsAt: new Date(Date.now() + 172_800_000),
          prizeTitle: "Test prize",
          status: RaffleStatus.SELLING,
        },
      },
    },
    include: { raffleDraw: true },
  });
  const quantity = 3;
  const reference = `STZJOIN-${unique}`;
  const amountKobo = 100_000 + event.raffleDraw.ticketPriceKobo * quantity;
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      purpose: PaymentPurpose.MEMBERSHIP_RAFFLE_TICKET,
      amountKobo,
      providerReference: reference,
      providerMetadata: { eventId: event.id, raffleDrawId: event.raffleDraw.id, quantity },
    },
  });
  mockSuccessfulPaystack(new Map([[reference, amountKobo]]));
  const firstService = new PaymentsService(prisma, config());
  const secondService = new PaymentsService(competingPrisma, config());

  try {
    await Promise.all([
      firstService.verifyRaffleTicketPayment(user.id, reference),
      secondService.verifyRaffleTicketPayment(user.id, reference),
    ]);
    const [entries, storedDraw, storedPayment, storedUser] = await Promise.all([
      prisma.raffleEntry.findMany({ where: { paymentId: payment.id }, orderBy: { number: "asc" } }),
      prisma.raffleDraw.findUniqueOrThrow({ where: { id: event.raffleDraw.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ]);

    assert.deepEqual(entries.map((entry) => entry.number), [1, 2, 3]);
    assert.ok(entries.every((entry) => entry.status === RaffleEntryStatus.PAID));
    assert.equal(storedDraw.nextEntryNumber, 4);
    assert.equal(storedPayment.status, PaymentStatus.SUCCESS);
    assert.equal(storedUser.subscriptionStatus, SubscriptionStatus.ACTIVE);
    const grantedDays = (storedUser.subscriptionEndsAt.getTime() - Date.now()) / 86_400_000;
    assert.ok(grantedDays > 29 && grantedDays < 31, `Expected one month, received ${grantedDays} days`);
  } finally {
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await Promise.all([prisma.$disconnect(), competingPrisma.$disconnect()]);
  }
});

test("two concurrent raffle draws settle on one winner", { skip: !connectionString }, async () => {
  const prisma = createClient();
  const competingPrisma = createClient();
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `draw-race-${unique}@example.com`, displayName: "Draw Race", passwordHash: "unused" },
  });
  const event = await prisma.event.create({
    data: {
      title: `Draw race ${unique}`,
      slug: `draw-race-${unique}`,
      category: "Raffle",
      kind: EventKind.RAFFLE,
      venue: "Online",
      city: "Lagos",
      startsAt: new Date(Date.now() + 86_400_000),
      status: EventStatus.PUBLISHED,
      raffleDraw: {
        create: {
          ticketPriceKobo: 1_000,
          salesStartsAt: new Date(Date.now() - 172_800_000),
          salesEndsAt: new Date(Date.now() - 60_000),
          drawsAt: new Date(Date.now() - 30_000),
          prizeTitle: "Draw prize",
          status: RaffleStatus.SALES_CLOSED,
        },
      },
    },
    include: { raffleDraw: true },
  });
  await prisma.raffleEntry.createMany({
    data: [1, 2, 3].map((number) => ({
      raffleDrawId: event.raffleDraw.id,
      userId: user.id,
      paymentId: `draw-payment-${unique}`,
      number,
      status: RaffleEntryStatus.PAID,
    })),
  });
  const storage = { signPhotoUrl: async (photo) => photo };
  const notifications = { emitUserChanged() {} };
  const firstService = new RafflesService(prisma, storage, notifications);
  const secondService = new RafflesService(competingPrisma, storage, notifications);

  try {
    const [first, second] = await Promise.all([
      firstService.runDraw("admin-test", event.id),
      secondService.runDraw("admin-test", event.id),
    ]);
    const storedDraw = await prisma.raffleDraw.findUniqueOrThrow({ where: { id: event.raffleDraw.id } });

    assert.equal(storedDraw.status, RaffleStatus.DRAWN);
    assert.ok(storedDraw.winnerEntryId);
    assert.equal(first.raffle.winner.entryId, storedDraw.winnerEntryId);
    assert.equal(second.raffle.winner.entryId, storedDraw.winnerEntryId);
  } finally {
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await Promise.all([prisma.$disconnect(), competingPrisma.$disconnect()]);
  }
});

test("ticket check-in is concurrency-safe and idempotent", { skip: !connectionString }, async () => {
  const prisma = createClient();
  const competingPrisma = createClient();
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `check-in-${unique}@example.com`, displayName: "Check In", passwordHash: "unused" },
  });
  const event = await prisma.event.create({
    data: {
      title: `Check-in event ${unique}`,
      slug: `check-in-event-${unique}`,
      category: "Community",
      kind: EventKind.STANDARD,
      venue: "Test venue",
      city: "Lagos",
      startsAt: new Date(Date.now() + 3_600_000),
      status: EventStatus.PUBLISHED,
      ticketTypes: { create: { name: "Regular", priceKobo: 0, capacity: 10, maxTicketsPerUser: 1 } },
    },
    include: { ticketTypes: true },
  });
  const code = `CHECKIN-${unique}`.toUpperCase();
  const ticket = await prisma.ticket.create({
    data: {
      eventId: event.id,
      userId: user.id,
      ticketTypeId: event.ticketTypes[0].id,
      code,
      status: TicketStatus.CONFIRMED,
    },
  });
  const firstService = new AdminService(prisma, {}, {});
  const secondService = new AdminService(competingPrisma, {}, {});

  try {
    const results = await Promise.all([
      firstService.checkInTicket(event.id, code.toLowerCase()),
      secondService.checkInTicket(event.id, code),
    ]);
    const storedTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });

    assert.deepEqual(results.map((result) => result.alreadyCheckedIn).sort(), [false, true]);
    assert.equal(storedTicket.status, TicketStatus.CHECKED_IN);
    assert.ok(storedTicket.checkedInAt instanceof Date);
    assert.ok(results.every((result) => result.ticket.checkedInAt.getTime() === storedTicket.checkedInAt.getTime()));
  } finally {
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await Promise.all([prisma.$disconnect(), competingPrisma.$disconnect()]);
  }
});
