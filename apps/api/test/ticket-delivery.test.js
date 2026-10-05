const assert = require("node:assert/strict");
const test = require("node:test");
const { EventStatus, PaymentPurpose, PaymentStatus, TicketStatus, UserRole } = require("@prisma/client");
const { EventsService } = require("../dist/src/events/events.service.js");
const { PaymentsService } = require("../dist/src/payments/payments.service.js");
const { MailService } = require("../dist/src/mail/mail.service.js");
const { TicketDeliveryService } = require("../dist/src/tickets/ticket-delivery.service.js");
const { TicketDownloadsService } = require("../dist/src/tickets/ticket-downloads.service.js");
const { GuestTicketsService } = require("../dist/src/events/guest-tickets.service.js");

const event = { id: "event-1", title: "Island Social Night", venue: "The House", city: "Lagos", state: "Lagos",
  startsAt: new Date("2099-10-10T19:00:00Z"), endsAt: new Date("2099-10-10T23:00:00Z"), status: EventStatus.PUBLISHED };
const holder = { id: "user-1", email: "ada@example.invalid", displayName: "Ada" };
const tier = { id: "tier-1", name: "Regular", capacity: 10, maxTicketsPerUser: 4, priceKobo: 1000 };
function ticket(id = "ticket-1", status = TicketStatus.PAID) {
  return { id, code: `STZ-${id}`, userId: holder.id, guestOrderId: null, eventId: event.id, event,
    ticketTypeId: tier.id, ticketType: tier, status, user: holder, guestOrder: null, createdAt: new Date(), checkedInAt: null };
}

test("a free member booking queues exactly its newly issued tickets in the issuance transaction", async () => {
  const issued = [], jobs = [];
  const transaction = {
    $queryRaw: async () => [],
    ticket: { count: async () => 0, create: async ({ data }) => { const row = { ...data, id: `ticket-${issued.length + 1}` }; issued.push(row); return row; } },
    ticketType: { update: async () => ({}) },
    ticketEmailDelivery: { upsert: async ({ create }) => { jobs.push(create); return create; } }
  };
  const service = new EventsService({ $transaction: async (callback) => callback(transaction) }, {});
  service.ensureMemberOrAdmin = async () => ({ role: UserRole.USER });
  service.findPublishedEvent = async () => ({ ...event, ticketTypes: [{ ...tier, priceKobo: 0 }] });
  service.getPublishedEventForUser = async () => event;
  await service.bookFreeEvent(holder.id, event.id, { quantity: 2 });
  assert.equal(issued.length, 2);
  assert.ok(issued.every((row) => row.status === TicketStatus.PAID));
  assert.deepEqual(jobs, [{ key: "free:ticket-1", ticketIds: ["ticket-1", "ticket-2"], nextAttemptAt: undefined }]);
});

test("a guest booking remains downloadable and has a durable retry when its confirmation email fails", async () => {
  const request = { id: "request-1", eventId: event.id, ticketTypeId: tier.id, email: holder.email,
    displayName: holder.displayName, quantity: 2, attempts: 0, consumedAt: null,
    expiresAt: new Date("2099-01-01"), event, ticketType: { ...tier, priceKobo: 0 } };
  const issued = [], jobs = [];
  let order;
  let deliveryUpdate;
  const transaction = {
    $queryRaw: async () => [],
    guestTicketRequest: { findUnique: async () => request, updateMany: async () => ({ count: 1 }) },
    guestTicketOrder: {
      findFirst: async () => null,
      create: async ({ data }) => { order = { ...data, id: "order-1" }; return order; }
    },
    ticket: { count: async () => 0, createMany: async ({ data }) => { issued.push(...data); return { count: data.length }; } },
    ticketType: { update: async () => ({}) },
    ticketEmailDelivery: { upsert: async ({ create }) => { jobs.push(create); return create; } }
  };
  const service = new GuestTicketsService({
    guestTicketRequest: transaction.guestTicketRequest,
    $transaction: async (callback) => callback(transaction),
    guestTicketOrder: { findUniqueOrThrow: async () => ({ ...order, event, ticketType: request.ticketType, tickets: issued }) },
    ticketEmailDelivery: { update: async ({ data }) => { deliveryUpdate = data; } }
  }, { sendGuestTicketConfirmationEmail: async () => false }, {
    get: () => "guest-ticket-test-secret", getOrThrow: () => "https://crushclub.ng"
  });
  request.codeHash = service.hashVerificationCode(request.id, "123456");
  const result = await service.confirmBooking(event.id, { requestId: request.id, code: "123456" });
  assert.equal(result.emailSent, false);
  assert.equal(result.tickets.length, 2);
  assert.match(result.manageUrl, /^https:\/\/crushclub\.ng\/guest-tickets\/order-1\?token=/);
  assert.ok(service.matchesManageToken(result.manageToken, order.manageTokenHash));
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].ticketIds, issued.map((row) => row.id));
  assert.ok(jobs[0].nextAttemptAt > new Date());
  assert.equal(jobs[0].key, "guest:order-1");
  assert.ok(!JSON.stringify(jobs).includes(result.manageToken), "The private guest link is not persisted in the email queue");
  assert.equal(deliveryUpdate.sentAt, null);
  assert.ok(deliveryUpdate.nextAttemptAt <= new Date());
});

function paymentFixture(purpose = PaymentPurpose.EVENT_TICKET) {
  let tickets = [ticket("ticket-1", TicketStatus.RESERVED), ticket("ticket-2", TicketStatus.RESERVED)]
    .map((row) => ({ ...row, reservedUntil: new Date("2099-01-01") }));
  const payment = { id: "payment-1", userId: holder.id, user: holder, purpose, status: PaymentStatus.PENDING,
    amountKobo: 2000, providerReference: "STZEV-test", providerMetadata: { ticketIds: tickets.map((row) => row.id) } };
  const jobs = [];
  const transaction = {
    $queryRaw: async () => [],
    payment: { findUniqueOrThrow: async () => payment, update: async ({ data }) => Object.assign(payment, data) },
    ticket: {
      findMany: async () => tickets, count: async () => 0,
      updateMany: async ({ data }) => { tickets.forEach((row) => Object.assign(row, data)); return { count: tickets.length }; },
      deleteMany: async () => { tickets = []; return { count: 2 }; }
    },
    ticketType: { update: async () => ({}) },
    ticketEmailDelivery: { upsert: async ({ create }) => { jobs.push(create); return create; } }
  };
  const service = new PaymentsService({ ...transaction, payment: { ...transaction.payment, findUnique: async () => payment },
    $transaction: async (callback) => Array.isArray(callback) ? Promise.all(callback) : callback(transaction) }, {});
  service.callPaystack = async () => ({ status: true, data: { status: "success", amount: 2000, currency: "NGN" } });
  service.activateMembershipIfNeeded = async () => null;
  return { service, jobs, payment, tickets };
}

for (const purpose of [PaymentPurpose.EVENT_TICKET, PaymentPurpose.MEMBERSHIP_EVENT_TICKET]) {
  test(`${purpose}: confirmed payment queues one email batch, repeated verification does not queue another`, async () => {
    const { service, jobs, payment } = paymentFixture(purpose);
    const first = await service.verifyAndActivateEventTicket(payment.providerReference);
    const second = await service.verifyAndActivateEventTicket(payment.providerReference);
    assert.equal(first.status, PaymentStatus.SUCCESS);
    assert.equal(second.tickets.length, 2);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].key, "payment:payment-1");
    assert.deepEqual(jobs[0].ticketIds, ["ticket-1", "ticket-2"]);
  });
}

test("failed payment and expired sold-out reservations never queue admission emails", async () => {
  const failed = paymentFixture();
  failed.service.callPaystack = async () => ({ status: true, data: { status: "failed" } });
  await failed.service.verifyAndActivateEventTicket(failed.payment.providerReference);
  assert.equal(failed.jobs.length, 0);

  const expired = paymentFixture();
  expired.tickets.forEach((row) => { row.reservedUntil = null; row.ticketType = { ...tier, capacity: 0 }; });
  const result = await expired.service.verifyAndActivateEventTicket(expired.payment.providerReference);
  assert.equal(result.refundRequired, true);
  assert.equal(expired.jobs.length, 0);
});

function deliveryFixture(rows = [ticket()], send = async () => true) {
  const job = { id: "job-1", key: "free:ticket-1", ticketIds: rows.map((row) => row.id), attempts: 0,
    sentAt: null, lockedUntil: null, nextAttemptAt: new Date(0), createdAt: new Date() };
  const sent = [];
  const prisma = {
    ticketEmailDelivery: {
      findMany: async () => !job.sentAt && job.nextAttemptAt <= new Date() && (!job.lockedUntil || job.lockedUntil <= new Date()) ? [{ ...job }] : [],
      updateMany: async () => {
        if (job.sentAt || (job.lockedUntil && job.lockedUntil > new Date())) return { count: 0 };
        job.lockedUntil = new Date(Date.now() + 120000); job.attempts++; return { count: 1 };
      },
      update: async ({ data }) => Object.assign(job, data)
    },
    ticket: { findMany: async ({ where }) => rows.filter((row) => where.status.in.includes(row.status) && row.event.status !== where.event.status.not) }
  };
  const mail = { sendTicketConfirmationEmail: async (input) => { sent.push(input); return send(input); } };
  const service = new TicketDeliveryService(prisma, mail, { getOrThrow: () => "https://crushclub.ng/" });
  return { service, prisma, mail, job, sent };
}

test("concurrent workers claim an email once, and successful jobs are not resent", async () => {
  const { service, prisma, mail, job, sent } = deliveryFixture();
  const competing = new TicketDeliveryService(prisma, mail, { getOrThrow: () => "https://crushclub.ng" });
  await Promise.all([service.runPendingDeliveries(), competing.runPendingDeliveries()]);
  await service.runPendingDeliveries();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, holder.email);
  assert.equal(sent[0].manageUrl, "https://crushclub.ng/events/event-1");
  assert.ok(job.sentAt);
});

test("an SMTP failure keeps the job for a later retry", async () => {
  let attempts = 0;
  const { service, job, sent } = deliveryFixture([ticket()], async () => ++attempts > 1);
  await service.runPendingDeliveries();
  assert.equal(job.sentAt, null);
  assert.equal(job.lockedUntil, null);
  assert.ok(job.nextAttemptAt > new Date());
  await service.runPendingDeliveries();
  assert.equal(sent.length, 1);
  job.nextAttemptAt = new Date(0);
  await service.runPendingDeliveries();
  assert.equal(sent.length, 2);
  assert.ok(job.sentAt);
});

test("cancelled tickets and cancelled events are discarded before email delivery", async () => {
  for (const row of [ticket("cancelled", TicketStatus.CANCELLED), { ...ticket(), event: { ...event, status: EventStatus.CANCELLED } }]) {
    const { service, job, sent } = deliveryFixture([row]);
    await service.runPendingDeliveries();
    assert.equal(sent.length, 0);
    assert.ok(job.sentAt);
  }
});

test("free guest confirmation and paid member confirmation both attach a downloadable PDF", async () => {
  const mail = new MailService({ get: (key) => key === "SMTP_FROM" ? "tickets@example.invalid" : undefined });
  const emails = [];
  mail.transporter = { sendMail: async (input) => { emails.push(input); } };
  await mail.sendGuestTicketConfirmationEmail({ to: holder.email, displayName: "Ada <script>", eventTitle: event.title,
    venue: event.venue, startsAt: event.startsAt, ticketTier: "Regular", ticketCodes: ["STZ-GUEST"],
    manageUrl: "https://crushclub.ng/guest-tickets/order?token=private" });
  await mail.sendTicketConfirmationEmail({ to: holder.email, displayName: holder.displayName, eventTitle: event.title,
    venue: event.venue, startsAt: event.startsAt, tickets: [{ code: "STZ-PAID", tier: "VIP", status: "PAID" }] });
  for (const email of emails) {
    assert.equal(email.attachments[0].contentType, "application/pdf");
    assert.equal(email.attachments[0].content.subarray(0, 4).toString(), "%PDF");
    assert.match(email.text, /Download the attached PDF/);
  }
  assert.ok(!emails[0].html.includes("<script>"));
  assert.match(emails[0].html, /Ada &lt;script&gt;/);
  assert.ok(!emails[1].text.includes("Your free"));
});

test("member downloads exclude other holders and reserved tickets", async () => {
  let requestedWhere;
  const downloads = new TicketDownloadsService({ ticket: { findMany: async ({ where }) => { requestedWhere = where; return []; } } }, {});
  await assert.rejects(downloads.downloadMemberTickets("other-user", event.id), /No confirmed tickets/);
  assert.equal(requestedWhere.userId, "other-user");
  assert.equal(requestedWhere.eventId, event.id);
  assert.ok(!requestedWhere.status.in.includes(TicketStatus.RESERVED));
});

test("guest PDF downloads require the original private booking token", async () => {
  const order = { id: "order-1", email: holder.email, displayName: holder.displayName, event, ticketType: tier, tickets: [ticket()] };
  const guestService = new GuestTicketsService({ guestTicketOrder: { findUnique: async () => order } }, {},
    { get: () => "guest-ticket-test-secret" });
  order.manageTokenHash = guestService.hashManageToken("correct-private-token");
  const downloads = new TicketDownloadsService({}, guestService);
  await assert.rejects(downloads.downloadGuestTickets(order.id), /Ticket booking not found/);
  await assert.rejects(downloads.downloadGuestTickets(order.id, "wrong-token"), /Ticket booking not found/);
  const pdf = await downloads.downloadGuestTickets(order.id, "correct-private-token");
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});
