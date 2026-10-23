const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { PrismaClient, EventType, EventStatus, TicketStatus } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { validate } = require("class-validator");
const { getWebsiteVenue, getTicketVenue, getVenueRevealAt, getVenueDetailsHash, queueEventVenueEmails } = require("../dist/src/events/event-venue.js");
const { EventsService } = require("../dist/src/events/events.service.js");
const { GuestTicketsService } = require("../dist/src/events/guest-tickets.service.js");
const { NotificationsService } = require("../dist/src/notifications/notifications.service.js");
const { TicketDeliveryService } = require("../dist/src/tickets/ticket-delivery.service.js");
const { UpdateEventDto } = require("../dist/src/events/dto/update-event.dto.js");

const secret = "SECRET ADDRESS 42 Hidden Street";
const base = { id: "event-1", title: "Venue fixture", eventType: EventType.PUBLIC, venue: secret, city: "Ikeja", state: "Lagos",
  startsAt: new Date("2099-10-31T16:00:00Z"), endsAt: new Date("2099-11-01T06:00:00Z"), status: EventStatus.PUBLISHED,
  ticketTypes: [], tickets: [] };

test("venue policy keeps hidden addresses off the website and observes the exact 24-hour boundary", () => {
  const exclusive = { ...base, eventType: EventType.EXCLUSIVE };
  const reveal = getVenueRevealAt(exclusive);
  assert.equal(reveal.toISOString(), "2099-10-30T16:00:00.000Z");
  assert.equal(getWebsiteVenue(base), secret);
  for (const type of [EventType.PRIVATE, EventType.EXCLUSIVE]) {
    const event = { ...base, eventType: type };
    assert(!getWebsiteVenue(event).includes(secret));
    assert(!getTicketVenue(event, reveal, { confirmed: false }).includes(secret));
  }
  assert(getTicketVenue({ ...base, eventType: EventType.PRIVATE }).includes(secret));
  assert(!getTicketVenue(exclusive, new Date(reveal.getTime() - 1)).includes(secret));
  assert(getTicketVenue(exclusive, reveal).includes(secret));
  assert(getTicketVenue(exclusive, new Date(reveal.getTime() + 1)).includes(secret));
  assert(!getTicketVenue(exclusive, reveal, { initialEmail: true }).includes(secret));
  assert(!getTicketVenue({ ...exclusive, status: EventStatus.CANCELLED }, reveal).includes(secret));
  assert.equal(getWebsiteVenue({ venue: secret }), secret, "legacy public fixtures remain compatible");
  assert.notEqual(getVenueDetailsHash(base), getVenueDetailsHash({ ...base, venueVersion: 2 }), "returning to a previously used address still gets a new delivery version");
});

test("public/member event responses, guest booking pages and alerts all redact venue fields; admin keeps editing access", async () => {
  const service = new EventsService({}, {});
  service.sumSuccessfulEventTicketPayments = async () => 0;
  const alerts = new NotificationsService({}, {});
  for (const eventType of [EventType.PRIVATE, EventType.EXCLUSIVE]) {
    const event = { ...base, eventType, updatedAt: new Date(), createdAt: new Date() };
    for (const options of [{ includePublicRoom: true }, { includeUserTickets: true }]) {
      const formatted = await service.formatEvent(event, { ...options, ticketTypeCounts: new Map() });
      assert.equal(formatted.eventType, eventType);
      assert(!JSON.stringify(formatted).includes(secret));
    }
    assert.equal((await service.formatEvent(event, { includeAdminCounts: true, ticketTypeCounts: new Map() })).venue, secret);
    assert(!JSON.stringify(alerts.formatEventAlert("EVENT_REMINDER", "alert", event)).includes(secret));
    const order = { id: "guest-1", event, ticketType: { id: "tier", name: "Regular", priceKobo: 0 }, tickets: [], displayName: "Guest" };
    const guests = new GuestTicketsService({ guestTicketOrder: { findUnique: async () => order } }, {}, { get: () => "fixture-secret" });
    order.manageTokenHash = guests.hashManageToken("valid-token");
    assert(!JSON.stringify(await guests.getManagedBooking(order.id, "valid-token")).includes(secret));
    assert.equal((await guests.getManagedBookingSource(order.id, "valid-token")).event.venue, secret);
    await assert.rejects(guests.getManagedBookingSource(order.id, "wrong-token"), /not found/);
  }
});

test("event updates validate type and do not queue any email for a Public-to-Private visibility-only change", async () => {
  assert.equal((await validate(Object.assign(new UpdateEventDto(), { eventType: "PRIVATE" }))).length, 0);
  assert((await validate(Object.assign(new UpdateEventDto(), { eventType: "UNKNOWN" }))).some(error => error.property === "eventType"));
  const original = { ...base, eventType: EventType.PUBLIC, bookingAccess: "PUBLIC" };
  let updated = { ...original }, writes = 0;
  const transaction = { event: {
    update: async ({ data }) => Object.assign(updated, data), findUniqueOrThrow: async () => updated
  }, chatRoom: { upsert: async () => {} }, $executeRaw: async () => { writes++; return 1; } };
  const service = new EventsService({ event: { findUnique: async () => original }, $transaction: async cb => cb(transaction) }, {});
  service.assertEventStatusTransition = async () => {};
  service.formatEvent = async event => event;
  assert.equal((await service.updateEvent(original.id, { eventType: "PRIVATE" })).eventType, "PRIVATE");
  assert.equal(writes, 0, "no confirmation or venue jobs are created for existing buyers");
  updated = { ...original };
  await service.updateEvent(original.id, { venue: "New private address", eventType: "PRIVATE" });
  assert.equal(writes, 2, "an actual venue change queues updated details");
});

function deliveryFixture(event, overrides = {}) {
  const delivery = { id: "delivery", eventId: event.id, userId: "holder", guestOrderId: null,
    detailsHash: getVenueDetailsHash(event), sentAt: null, event };
  const sent = [];
  const ticket = { code: "CCL-FIXTURE", status: TicketStatus.PAID, ticketType: { name: "Regular" }, user: { email: "holder@example.invalid", displayName: "Holder" } };
  const prisma = { eventVenueEmail: { findUnique: async () => delivery, updateMany: async () => { delivery.sentAt = new Date(); return { count: 1 }; } },
    event: { findUnique: async () => event }, ticket: { findMany: async () => [ticket] }, ...overrides };
  const mail = { sendEventVenueEmail: async input => { sent.push(input); return true; } };
  return { delivery, sent, prisma, service: new TicketDeliveryService(prisma, mail, {}) };
}

test("venue delivery waits for its deadline, rechecks edits/cancellations and the worker lease before sending", async () => {
  const early = deliveryFixture({ ...base, eventType: EventType.EXCLUSIVE });
  await assert.rejects(early.service.deliverVenue("delivery", "<stable>"), { code: "VENUE_NOT_DUE" });
  assert.equal(early.sent.length, 0);
  const lateEvent = { ...base, eventType: EventType.EXCLUSIVE, startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000) };
  const late = deliveryFixture(lateEvent);
  await late.service.deliverVenue("delivery", "<stable>");
  assert(late.sent[0].venue.includes(secret));
  assert.equal(late.sent[0].messageId, "<stable>");
  await late.service.deliverVenue("delivery", "<stable>");
  assert.equal(late.sent.length, 1);
  for (const edit of [{ status: EventStatus.CANCELLED }, { venue: "Different venue" }, { startsAt: base.startsAt }]) {
    const fixture = deliveryFixture(lateEvent);
    fixture.prisma.event.findUnique = async () => ({ ...lateEvent, ...edit });
    await fixture.service.deliverVenue("delivery", "<stable>");
    assert.equal(fixture.sent.length, 0);
  }
  const lostLease = deliveryFixture(lateEvent);
  await assert.rejects(lostLease.service.deliverVenue("delivery", "<stable>", async () => { throw new Error("lease lost"); }), /lease lost/);
  assert.equal(lostLease.sent.length, 0);
  const failure = deliveryFixture(lateEvent);
  failure.service.mail.sendEventVenueEmail = async () => false;
  await assert.rejects(failure.service.deliverVenue("delivery", "<stable>"), { code: "SMTP_NOT_CONFIGURED" });
  assert.equal(failure.delivery.sentAt, null);
});

test("Exclusive ticket confirmations hide the venue even for last-minute purchases and schedule a separate email", async () => {
  const event = { ...base, eventType: EventType.EXCLUSIVE, startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000) };
  let enqueues = 0, confirmation;
  const ticket = { id: "ticket", eventId: event.id, event, userId: "holder", guestOrderId: null, code: "CCL-FIXTURE", status: TicketStatus.PAID,
    ticketType: { name: "Regular" }, user: { email: "holder@example.invalid", displayName: "Holder" } };
  const transaction = { $executeRaw: async () => { enqueues++; return 1; } };
  const service = new TicketDeliveryService({ ticket: { findMany: async () => [ticket] }, $transaction: async cb => cb(transaction) },
    { sendTicketConfirmationEmail: async input => { confirmation = input; return true; } }, { getOrThrow: () => "https://example.invalid" });
  await service.deliver(["ticket"], "<initial>");
  assert.equal(enqueues, 2);
  assert(!JSON.stringify(confirmation).includes(secret));
  assert.match(confirmation.venue, /24 hours/);
});

test("database scheduling groups confirmed member/guest tickets, survives restarts and pruning, and replaces stale schedules", {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const prefix = `venue-${randomUUID()}`;
  let event;
  const user = await prisma.user.create({ data: { email: `${prefix}@example.invalid`, displayName: "Venue fixture", passwordHash: "not-a-login" } });
  const pending = await prisma.user.create({ data: { email: `${prefix}-pending@example.invalid`, displayName: "Pending", passwordHash: "not-a-login" } });
  try {
    event = await prisma.event.create({ data: { title: prefix, slug: prefix, venue: secret, city: "Ikeja", state: "Lagos", category: "Community",
      eventType: EventType.EXCLUSIVE, status: EventStatus.PUBLISHED, startsAt: new Date(Date.now() + 48 * 3600000), endsAt: new Date(Date.now() + 50 * 3600000),
      ticketTypes: { create: { name: "Regular", priceKobo: 0, capacity: 20 } } }, include: { ticketTypes: true } });
    const guest = await prisma.guestTicketOrder.create({ data: { eventId: event.id, ticketTypeId: event.ticketTypes[0].id,
      email: `${prefix}-guest@example.invalid`, displayName: "Guest", manageTokenHash: prefix } });
    await prisma.ticket.createMany({ data: [
      ...[1, 2].map(i => ({ code: `${prefix}-member-${i}`, eventId: event.id, ticketTypeId: event.ticketTypes[0].id, userId: user.id, status: TicketStatus.PAID })),
      ...[1, 2].map(i => ({ code: `${prefix}-guest-${i}`, eventId: event.id, ticketTypeId: event.ticketTypes[0].id, guestOrderId: guest.id, status: TicketStatus.CONFIRMED })),
      { code: `${prefix}-reserved`, eventId: event.id, ticketTypeId: event.ticketTypes[0].id, userId: pending.id, status: TicketStatus.RESERVED },
      { code: `${prefix}-refunded`, eventId: event.id, ticketTypeId: event.ticketTypes[0].id, userId: pending.id, status: TicketStatus.REFUNDED }
    ] });
    const queue = detailsChanged => prisma.$transaction(tx => queueEventVenueEmails(tx, event, { detailsChanged }));
    await Promise.all([queue(false), queue(false)]);
    let deliveries = await prisma.eventVenueEmail.findMany({ where: { eventId: event.id } });
    assert.equal(deliveries.length, 2);
    const originalIds = deliveries.map(d => d.id);
    const jobsFor = ids => prisma.backgroundJob.findMany({ where: { key: { in: ids.map(id => `event-venue-email:${id}`) } } });
    let jobs = await jobsFor(originalIds);
    assert.equal(jobs.length, 2);
    assert(jobs.every(j => j.runAt.getTime() === getVenueRevealAt(event).getTime()));
    assert(!JSON.stringify(jobs).includes(secret));

    event = await prisma.event.update({ where: { id: event.id }, data: { startsAt: new Date(Date.now() + 72 * 3600000), endsAt: new Date(Date.now() + 74 * 3600000) } });
    await queue(false);
    assert.equal(await prisma.eventVenueEmail.count({ where: { eventId: event.id } }), 4);
    const sent = [];
    const mail = { sendEventVenueEmail: async input => { sent.push(input); return true; } };
    const worker = new TicketDeliveryService(prisma, mail, {});
    await worker.deliverVenue(originalIds[0], "<stale>");
    assert.equal(sent.length, 0);

    event = await prisma.event.update({ where: { id: event.id }, data: { startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000), venue: "Updated secret venue" } });
    await queue(false);
    deliveries = await prisma.eventVenueEmail.findMany({ where: { eventId: event.id, detailsHash: getVenueDetailsHash(event) } });
    jobs = await jobsFor(deliveries.map(d => d.id));
    assert(jobs.every(j => Math.abs(j.runAt.getTime() - Date.now()) < 5000));
    const member = deliveries.find(d => d.userId === user.id), guestDelivery = deliveries.find(d => d.guestOrderId === guest.id);
    await worker.deliverVenue(member.id, "<member>");
    await worker.deliverVenue(guestDelivery.id, "<guest>");
    assert.equal(sent.length, 2);
    assert(sent.every(email => email.tickets.length === 2 && email.venue.includes("Updated secret venue")));
    await prisma.backgroundJob.deleteMany({ where: { key: { in: deliveries.map(d => `event-venue-email:${d.id}`) } } });
    await queue(false);
    await new TicketDeliveryService(prisma, mail, {}).deliverVenue(member.id, "<after-restart>");
    assert.equal((await jobsFor(deliveries.map(d => d.id))).length, 0);
    assert.equal(sent.length, 2, "sent receipts survive background-job retention cleanup");

    event = await prisma.event.update({ where: { id: event.id }, data: { eventType: EventType.PRIVATE, venue: "Private updated venue" } });
    await queue(true);
    const changed = await prisma.eventVenueEmail.findMany({ where: { eventId: event.id, detailsHash: getVenueDetailsHash(event) } });
    assert.equal(changed.length, 2);
    event = await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.CANCELLED } });
    await worker.deliverVenue(changed[0].id, "<cancelled>");
    assert.equal(sent.length, 2);
  } finally {
    if (event) {
      const deliveries = await prisma.eventVenueEmail.findMany({ where: { eventId: event.id }, select: { id: true } });
      await prisma.backgroundJob.deleteMany({ where: { key: { in: deliveries.map(d => `event-venue-email:${d.id}`) } } });
      await prisma.event.delete({ where: { id: event.id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [user.id, pending.id] } } });
    await prisma.$disconnect();
  }
});
