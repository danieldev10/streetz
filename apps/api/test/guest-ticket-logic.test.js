const assert = require("node:assert/strict");
const test = require("node:test");
const { assertGuestTicketAvailability, normalizeGuestEmail } = require("../dist/src/events/guest-ticket-logic.js");

test("guest email normalization is case-insensitive", () => {
  assert.equal(normalizeGuestEmail("  Guest@Example.COM "), "guest@example.com");
});

test("guest availability enforces capacity and the per-email limit", () => {
  assert.doesNotThrow(() => assertGuestTicketAvailability({
    quantity: 2,
    activeTickets: 3,
    capacity: 5,
    guestOwnedTickets: 0,
    maxTicketsPerGuest: 2
  }));

  assert.throws(() => assertGuestTicketAvailability({
    quantity: 1,
    activeTickets: 5,
    capacity: 5,
    guestOwnedTickets: 0,
    maxTicketsPerGuest: 2
  }), /sold out/i);

  assert.throws(() => assertGuestTicketAvailability({
    quantity: 1,
    activeTickets: 1,
    capacity: 5,
    guestOwnedTickets: 2,
    maxTicketsPerGuest: 2
  }), /maximum/i);
});
