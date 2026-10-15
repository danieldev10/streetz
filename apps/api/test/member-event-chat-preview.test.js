const assert = require("node:assert/strict");
const test = require("node:test");
const { AccountStatus, EventStatus, SubscriptionStatus, TicketStatus, UserRole } = require("@prisma/client");
const { EventsService } = require("../dist/src/events/events.service.js");
const { RoomsService } = require("../dist/src/rooms/rooms.service.js");

test("members can chat before booking; guests stay read-only and cancelled event rooms are hidden", async () => {
  const event = { id: "event-1", status: EventStatus.PUBLISHED, startsAt: new Date("2099-10-10"), endsAt: null,
    ticketTypes: [], tickets: [], room: { id: "room-1", isActive: true, memberships: [] } };
  const service = new EventsService({}, {});
  const options = { includeUserTickets: true, ticketTypeCounts: new Map() };
  assert.equal((await service.formatEvent(event, options)).room.readOnly, false);
  assert.equal((await service.formatEvent(event, { ...options, includeUserTickets: false, includePublicRoom: true })).room.readOnly, true);
  event.tickets = [{ id: "ticket-1", code: "STZ-123456", status: TicketStatus.PAID, createdAt: new Date(), checkedInAt: null }];
  assert.equal((await service.formatEvent(event, options)).room.readOnly, false);
  event.status = EventStatus.CANCELLED;
  assert.equal((await service.formatEvent(event, options)).room, null);
});

test("event chats still reject expired memberships and blocked accounts", async () => {
  for (const overrides of [
    { subscriptionEndsAt: new Date("2000-01-01") },
    { subscriptionStatus: SubscriptionStatus.INACTIVE },
    { accountStatus: AccountStatus.BANNED },
  ]) {
    const service = new RoomsService({ user: { findUnique: async () => ({
      role: UserRole.USER, accountStatus: AccountStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionEndsAt: new Date("2099-01-01"),
      suspendedUntil: null, ...overrides
    }) } }, {});
    await assert.rejects(service.joinRoom("member-1", "room-1"), { status: 403 });
    await assert.rejects(service.createRoomMessage("member-1", "room-1", "Hello"), { status: 403 });
  }
});
