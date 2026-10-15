const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { AdmissionsService } = require("../dist/src/admissions/admissions.service.js");

test("event staff admission is scoped, revocable, audited and safe across concurrent scanners", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const other = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const service = new AdmissionsService(prisma), second = new AdmissionsService(other);
  const suffix = randomUUID(), userIds = [], eventIds = [];
  const user = async (name, role = "USER") => {
    const row = await prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, displayName: name, role,
      passwordHash: "unused", subscriptionStatus: "INACTIVE" } });
    userIds.push(row.id); return row;
  };
  const event = async (name) => {
    const row = await prisma.event.create({ data: { title: name, slug: name + suffix, category: "Community", venue: "Test gate",
      city: "Lagos", startsAt: new Date(Date.now() + 3600000), status: "PUBLISHED",
      ticketTypes: { create: { name: "Regular", priceKobo: 0, capacity: 10 } } }, include: { ticketTypes: true } });
    eventIds.push(row.id); return row;
  };
  try {
    const admin = await user("admin", "ADMIN"), staff = await user("staff"), staffTwo = await user("staff-two"), stranger = await user("stranger");
    const first = await event("first"), elsewhere = await event("elsewhere");
    await assert.rejects(service.listEvents(stranger.id), /restricted to admins and assigned event staff/);
    await assert.rejects(service.getEvent(stranger.id, first.id), /not assigned/);
    assert.ok((await service.listEvents(admin.id)).events.some((row) => row.id === first.id));
    await assert.rejects(service.assignStaff(staff.id, first.id, stranger.email), /Only admins/);
    await assert.rejects(service.listStaff(staff.id, first.id), /Only admins/);
    await service.assignStaff(admin.id, first.id, staff.email.toUpperCase());
    await service.assignStaff(admin.id, first.id, staff.email);
    assert.equal((await service.listStaff(admin.id, first.id)).staff.length, 1, "repeated grants are idempotent");
    assert.deepEqual((await service.listEvents(staff.id)).events.map((row) => row.id), [first.id]);
    await assert.rejects(service.getEvent(staff.id, elsewhere.id), /not assigned/);
    await assert.rejects(service.removeStaff(staff.id, first.id, staff.id), /Only admins/);
    const createTicket = (name, status = "CONFIRMED") => prisma.ticket.create({ data: { eventId: first.id, userId: stranger.id,
      ticketTypeId: first.ticketTypes[0].id, code: `${name}-${suffix}`.toUpperCase(), status } });
    const legacy = await createTicket("STZTIX");
    await assert.rejects(service.checkInTicket(stranger.id, first.id, legacy.code), /not assigned/);
    await assert.rejects(service.checkInTicket(staff.id, elsewhere.id, legacy.code), /not assigned/);
    await assert.rejects(service.checkInTicket(admin.id, elsewhere.id, legacy.code), /not found/);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: legacy.id } })).status, "CONFIRMED");
    const accepted = await service.checkInTicket(staff.id, first.id, legacy.code.toLowerCase());
    assert.equal(accepted.alreadyCheckedIn, false);
    assert.equal(accepted.ticket.checkedInBy.id, staff.id);
    assert.equal(accepted.ticket.holder.displayName, stranger.displayName);
    assert.equal(accepted.ticket.holder.email, undefined, "the scanner does not disclose customer email");
    const duplicate = await service.checkInTicket(admin.id, first.id, legacy.code);
    assert.equal(duplicate.alreadyCheckedIn, true);
    assert.equal(duplicate.ticket.checkedInBy.id, staff.id);
    assert.equal(duplicate.ticket.checkedInAt.getTime(), accepted.ticket.checkedInAt.getTime());
    assert.equal((await service.getEvent(staff.id, first.id)).checkedInCount, 1);
    for (const status of ["RESERVED", "CANCELLED", "REFUNDED"]) {
      const row = await createTicket("INVALID-" + status, status);
      await assert.rejects(service.checkInTicket(staff.id, first.id, row.code), /not valid/);
      assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: row.id } })).checkedInAt, null);
    }
    await service.assignStaff(admin.id, first.id, staffTwo.email);
    const race = await createTicket("CCLTIX");
    const results = await Promise.all([service.checkInTicket(staff.id, first.id, race.code), second.checkInTicket(staffTwo.id, first.id, race.code)]);
    assert.deepEqual(results.map((row) => row.alreadyCheckedIn).sort(), [false, true]);
    assert.equal(results[0].ticket.checkedInBy.id, results[1].ticket.checkedInBy.id);
    await service.removeStaff(admin.id, first.id, staff.id);
    await assert.rejects(service.checkInTicket(staff.id, first.id, race.code), /not assigned/);
    await assert.rejects(service.listEvents(staff.id), /restricted to admins and assigned event staff/);
    await prisma.user.update({ where: { id: staffTwo.id }, data: { accountStatus: "BANNED" } });
    await assert.rejects(service.checkInTicket(staffTwo.id, first.id, race.code), /active account/);
    await prisma.event.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    const cancelled = await createTicket("CANCELLED-EVENT");
    await assert.rejects(service.checkInTicket(admin.id, first.id, cancelled.code), /cancelled event/);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    await assert.rejects(service.listStaff(admin.id, first.id), /Only admins/);
  } finally {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all([prisma.$disconnect(), other.$disconnect()]);
  }
});
