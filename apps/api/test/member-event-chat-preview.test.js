const assert = require("node:assert/strict");
const test = require("node:test");
const { AccountStatus, EventStatus, SubscriptionStatus, TicketStatus, UserRole } = require("@prisma/client");
const { EventsService } = require("../dist/src/events/events.service.js");
const { RoomsService } = require("../dist/src/rooms/rooms.service.js");

test("members without tickets receive a read-only room link; ticket holders receive chat access", async () => {
  const event = { id: "event-1", status: EventStatus.PUBLISHED, startsAt: new Date("2099-10-10"), endsAt: null,
    ticketTypes: [], tickets: [], room: { id: "room-1", isActive: true, memberships: [] } };
  const service = new EventsService({}, {});
  const options = { includeUserTickets: true, ticketTypeCounts: new Map() };
  assert.deepEqual((await service.formatEvent(event, options)).room.readOnly, true);
  event.tickets = [{ id: "ticket-1", code: "STZ-123456", status: TicketStatus.PAID, createdAt: new Date(), checkedInAt: null }];
  assert.equal((await service.formatEvent(event, options)).room.readOnly, false);
  event.status = EventStatus.CANCELLED;
  assert.equal((await service.formatEvent(event, options)).room, null);
});

test("the API rejects joining or sending messages when a member has no confirmed event ticket", async () => {
  const service = new RoomsService({
    user: { findUnique: async () => ({ role: UserRole.USER, accountStatus: AccountStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionEndsAt: new Date("2099-01-01"), suspendedUntil: null }) },
    chatRoom: { findFirst: async ({ where }) => {
      assert.equal(where.event.is.tickets.some.userId, "member-1");
      assert.ok(where.event.is.tickets.some.status.in.includes(TicketStatus.PAID));
      return null;
    } }
  }, {});
  await assert.rejects(service.joinRoom("member-1", "room-1"), /This event chat is not available/);
  await assert.rejects(service.createRoomMessage("member-1", "room-1", { body: "Hello" }), /This event chat is not available/);
});
