require("./register-typescript.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const { getEventTicketAvailability } = require("../src/features/events/event-display.ts");

const earlyBird = { id: "early", name: "Early Bird", priceKobo: 1200000, capacity: 1, soldCount: 1, reservedCount: 0, availableCount: 0, maxTicketsPerUser: 1 };
const regular = { ...earlyBird, id: "regular", name: "Regular", capacity: 100, soldCount: 0, availableCount: 100, maxTicketsPerUser: 4 };
const event = { status: "PUBLISHED", startsAt: "2099-10-31T16:00:00Z", endsAt: "2099-11-01T06:00:00Z", ticketTypes: [earlyBird, regular], userTickets: [] };
const owned = (id, tier) => ({ id, status: "PAID", ticketType: tier });

test("selling out Early Bird does not close the event while another tier has tickets", () => {
  for (const isGuest of [true, false]) {
    assert.deepEqual(getEventTicketAvailability(event, isGuest), { isSoldOut: false, canBookMore: true, isLimitReached: false });
  }
  const soldOut = { ...event, ticketTypes: [earlyBird, { ...regular, availableCount: 0 }] };
  assert.deepEqual(getEventTicketAvailability(soldOut, false), { isSoldOut: true, canBookMore: false, isLimitReached: false });
});

test("a customer's limit applies separately to each tier", () => {
  const inStockEarlyBird = { ...earlyBird, capacity: 10, availableCount: 9 };
  const partlyLimited = { ...event, ticketTypes: [inStockEarlyBird, regular], userTickets: [owned("early-1", earlyBird)] };
  assert.equal(getEventTicketAvailability(partlyLimited, false).canBookMore, true);
  const allLimited = { ...partlyLimited, userTickets: [...partlyLimited.userTickets, ...Array.from({ length: 4 }, (_, i) => owned(`regular-${i}`, regular))] };
  assert.deepEqual(getEventTicketAvailability(allLimited, false), { isSoldOut: false, canBookMore: false, isLimitReached: true });
  assert.equal(getEventTicketAvailability(allLimited, true).canBookMore, true);
});

test("legacy single-tier, missing-tier and unavailable events retain their booking restrictions", () => {
  assert.equal(getEventTicketAvailability({ ...event, ticketTypes: [], ticketType: regular }, false).canBookMore, true);
  assert.deepEqual(getEventTicketAvailability({ ...event, ticketTypes: [], ticketType: null }, false), { isSoldOut: false, canBookMore: false, isLimitReached: false });
  assert.equal(getEventTicketAvailability({ ...event, status: "CANCELLED" }, false).canBookMore, false);
  assert.equal(getEventTicketAvailability({ ...event, startsAt: "2020-01-01", endsAt: "2020-01-02" }, false).canBookMore, false);
});
