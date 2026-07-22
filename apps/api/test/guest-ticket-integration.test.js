const assert = require("node:assert/strict");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { EventBookingAccess, EventKind, EventStatus, PrismaClient } = require("@prisma/client");
const { GuestTicketsService } = require("../dist/src/events/guest-tickets.service.js");

const connectionString = process.env.TEST_DATABASE_URL;

test("two guests competing for the final ticket cannot oversell", { skip: !connectionString }, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const competingPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const config = {
    get(key) {
      if (key === "GUEST_TICKET_SECRET") return "guest-ticket-test-secret";
      return undefined;
    },
    getOrThrow(key) {
      if (key === "JWT_ACCESS_SECRET") return "fallback-test-secret";
      if (key === "WEB_APP_URL") return "http://localhost:3000";
      throw new Error(`Unexpected configuration key: ${key}`);
    }
  };
  const mail = {
    sendGuestTicketVerificationEmail: async () => true,
    sendGuestTicketConfirmationEmail: async () => true
  };
  const service = new GuestTicketsService(prisma, mail, config);
  const competingService = new GuestTicketsService(competingPrisma, mail, config);
  const event = await prisma.event.create({
    data: {
      title: `Guest race ${unique}`,
      slug: `guest-race-${unique}`,
      description: "Concurrency test",
      category: "Community",
      kind: EventKind.STANDARD,
      bookingAccess: EventBookingAccess.PUBLIC,
      venue: "Test venue",
      state: "Lagos",
      city: "Ikeja",
      startsAt: new Date(Date.now() + 86_400_000),
      status: EventStatus.PUBLISHED,
      ticketTypes: {
        create: {
          name: "Regular",
          priceKobo: 0,
          capacity: 1,
          maxTicketsPerUser: 1
        }
      }
    },
    include: { ticketTypes: true }
  });

  try {
    const firstRequest = await service.requestVerification(event.id, {
      email: `first-${unique}@example.com`,
      displayName: "First Guest",
      ticketTypeId: event.ticketTypes[0].id,
      quantity: 1
    });
    const secondRequest = await service.requestVerification(event.id, {
      email: `second-${unique}@example.com`,
      displayName: "Second Guest",
      ticketTypeId: event.ticketTypes[0].id,
      quantity: 1
    });

    const results = await Promise.allSettled([
      service.confirmBooking(event.id, { requestId: firstRequest.requestId, code: firstRequest.verificationCode }),
      competingService.confirmBooking(event.id, { requestId: secondRequest.requestId, code: secondRequest.verificationCode })
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    const [ticketCount, ticketType] = await Promise.all([
      prisma.ticket.count({ where: { eventId: event.id } }),
      prisma.ticketType.findUniqueOrThrow({ where: { id: event.ticketTypes[0].id } })
    ]);

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0].reason?.message), /sold out/i);
    assert.equal(ticketCount, 1);
    assert.equal(ticketType.soldCount, 1);

    const successfulBooking = fulfilled[0].value;
    await assert.rejects(
      () => service.requestVerification(event.id, {
        email: successfulBooking.email.toUpperCase(),
        displayName: "Repeat Guest",
        ticketTypeId: event.ticketTypes[0].id,
        quantity: 1
      }),
      /already has a booking/i
    );

    const managedBooking = await service.getManagedBooking(successfulBooking.orderId, successfulBooking.manageToken);
    assert.equal(managedBooking.orderId, successfulBooking.orderId);
    assert.deepEqual(managedBooking.tickets.map((ticket) => ticket.code), successfulBooking.tickets.map((ticket) => ticket.code));
    await assert.rejects(() => service.getManagedBooking(successfulBooking.orderId, "wrong-token"), /not found/i);
  } finally {
    await prisma.event.delete({ where: { id: event.id } });
    await Promise.all([prisma.$disconnect(), competingPrisma.$disconnect()]);
  }
});
