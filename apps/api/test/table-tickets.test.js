const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { EventsService } = require("../dist/src/events/events.service.js");
const { PaymentsService } = require("../dist/src/payments/payments.service.js");
const { UpdateEventDto } = require("../dist/src/events/dto/update-event.dto.js");
const { EVENT_TICKET_TIER_NAMES, TABLE_TICKET_TIER_NAMES, getTableSize } = require("../dist/src/events/ticket-tiers.js");

test("event DTO accepts all table sizes alongside the existing tiers and rejects unsupported sizes", async () => {
  const tiers = EVENT_TICKET_TIER_NAMES.map((name, i) => ({ name, priceKobo: 5000000 + i * 100, capacity: 10, maxTicketsPerUser: 2 }));
  assert.equal((await validate(plainToInstance(UpdateEventDto, { ticketTypes: tiers }))).length, 0);
  for (const ticketTypes of [[{ ...tiers[0], name: "Table of 12" }], [{ ...tiers[0], capacity: 0 }], [{ ...tiers[0], maxTicketsPerUser: 0 }]]) {
    assert.ok((await validate(plainToInstance(UpdateEventDto, { ticketTypes }))).length > 0);
  }
  const events = new EventsService({}, {});
  const built = events.buildTicketTypeInputs({ ticketTypes: tiers });
  assert.deepEqual(built, tiers);
  assert.deepEqual(events.buildTicketTypeInputs({ ticketTypes: [{ name: "Table of 4", priceKobo: 5000000 }] }), [{ name: "Table of 4", priceKobo: 5000000, capacity: 10, maxTicketsPerUser: 1 }]);
  assert.throws(() => events.buildTicketTypeInputs({ ticketTypes: [tiers[3], tiers[3]] }), /Duplicate ticket tier/);
  assert.throws(() => events.buildTicketTypeInputs({ ticketTypes: [{ ...tiers[3], capacity: 1, maxTicketsPerUser: 2 }] }), /greater than event capacity/);
  assert.deepEqual(events.buildTicketTypeInputs({ ticketTypes: [tiers[3]] }, tiers), [tiers[3]], "clearing an unsold size removes its offer instead of reviving its previous price");
  const payments = new PaymentsService({}, {});
  for (const name of TABLE_TICKET_TIER_NAMES) assert.equal(payments.normalizeTicketTypeName(name), name);
  assert.deepEqual(TABLE_TICKET_TIER_NAMES.map(getTableSize), [4, 5, 6, 8, 10]);
});

test("table purchases cannot oversell a size, keep limits independent and charge whole-table prices", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const make = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const one = make(), two = make(), suffix = randomUUID();
  const config = { get: () => undefined, getOrThrow: (key) => key === "WEB_APP_URL" ? "https://example.invalid" : "fixture-only-secret" };
  const users = await Promise.all([1, 2].map((n) => one.user.create({ data: { email: `table-${suffix}-${n}@example.invalid`, displayName: "Table fixture", passwordHash: "unused", subscriptionStatus: "ACTIVE", subscriptionEndsAt: new Date(Date.now() + 86400000) } })));
  const event = await one.event.create({ data: { title: "Table fixture", slug: `table-${suffix}`, category: "Nightlife", venue: "Fixture", city: "Lagos", startsAt: new Date(Date.now() + 86400000), status: "PUBLISHED", ticketTypes: { create: TABLE_TICKET_TIER_NAMES.map((name, i) => ({ name, priceKobo: 5000000 + i * 1000000, capacity: i ? 3 : 1, maxTicketsPerUser: i ? 2 : 1 })) } }, include: { ticketTypes: true } });
  const first = new PaymentsService(one, config), second = new PaymentsService(two, config);
  const four = event.ticketTypes.find((t) => t.name === "Table of 4"), five = event.ticketTypes.find((t) => t.name === "Table of 5");
  try {
    const race = await Promise.allSettled([first.reserveEventTicketsForPayment(users[0].id, event.id, { ticketTypeId: four.id, quantity: 1 }, { allowFreeTickets: false }), second.reserveEventTicketsForPayment(users[1].id, event.id, { ticketTypeId: four.id, quantity: 1 }, { allowFreeTickets: false })]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await one.ticket.count({ where: { ticketTypeId: four.id, status: "RESERVED" } }), 1);
    let sent;
    first.callPaystack = async (_path, options) => { sent = JSON.parse(options.body); return { status: true, data: { authorization_url: "https://example.invalid/pay", access_code: "fixture" } }; };
    const checkout = await first.initializeEventTicket(users[0].id, event.id, { ticketTypeId: five.id, quantity: 2 });
    assert.equal(sent.amount, five.priceKobo * 2);
    assert.equal(sent.metadata.ticketTypeName, "Table of 5");
    assert.equal(checkout.ticketIds.length, 2);
    const payment = await one.payment.findUniqueOrThrow({ where: { providerReference: checkout.reference } });
    assert.equal(payment.amountKobo, five.priceKobo * 2);
    assert.equal(payment.providerMetadata.ticketTypeName, "Table of 5");
    first.callPaystack = async () => ({ status: true, data: { reference: checkout.reference, status: "success", amount: five.priceKobo * 2, currency: "NGN", domain: "test" } });
    await first.verifyPaymentReference(checkout.reference);
    await assert.rejects(first.reserveEventTicketsForPayment(users[0].id, event.id, { ticketTypeId: five.id, quantity: 1 }, { allowFreeTickets: false }), /limit|maximum|own/i);
    assert.equal(await one.ticket.count({ where: { ticketTypeId: five.id, status: "PAID" } }), 2);
    assert.equal(await one.ticket.count({ where: { ticketTypeId: { in: event.ticketTypes.filter((t) => ![four.id, five.id].includes(t.id)).map((t) => t.id) } } }), 0);
    const six = event.ticketTypes.find((t) => t.name === "Table of 6");
    await first.reserveEventTicketsForPayment(users[0].id, event.id, { ticketTypeId: six.id, quantity: 1 }, { allowFreeTickets: false });
    assert.equal(await one.ticket.count({ where: { ticketTypeId: six.id, status: "RESERVED" } }), 1, "a purchased size's ownership limit does not block another size");
  } finally {
    const payments = await one.payment.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { id: true } });
    await one.backgroundJob.deleteMany({ where: { key: { in: payments.map((p) => `ticket-email:payment:${p.id}`) } } });
    await one.payment.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await one.event.delete({ where: { id: event.id } });
    await one.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await Promise.all([one.$disconnect(), two.$disconnect()]);
  }
});
