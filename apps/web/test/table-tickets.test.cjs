require("./register-typescript.cjs");
const assert = require("node:assert/strict");
const test = require("node:test");
const { createEmptyEventForm, buildAdminEventPayload, getEventForm } = require("../src/features/events/admin-event-model.ts");
const { getEventTicketTypes, getMaxPurchaseQuantity, getEventTicketAvailability, normalizeTicketTierName } = require("../src/features/events/event-display.ts");
const { TABLE_TICKET_TIER_NAMES, getTableSize } = require("../src/features/events/ticket-tiers.ts");
const validForm = () => ({ ...createEmptyEventForm(), title: "Tables fixture", category: "Nightlife", venue: "Fixture venue", state: "Lagos", city: "Ikeja", startsAt: "2099-10-31T17:00", endsAt: "2099-11-01T07:00" });

test("all five table sizes keep independent prices, capacities and per-person maxima through create/edit", () => {
  const form = validForm();
  for (const [index, name] of TABLE_TICKET_TIER_NAMES.entries()) form.ticketTiers[name] = { priceNaira: String(50000 + index * 10000), capacity: String(index + 3), maxTicketsPerUser: String(index + 1) };
  const result = buildAdminEventPayload(form);
  assert.equal(result.ok, true);
  assert.equal(result.payload.ticketTypes.length, 5);
  assert.deepEqual(result.payload.ticketTypes.map((t) => [t.name, t.priceKobo, t.capacity, t.maxTicketsPerUser]), TABLE_TICKET_TIER_NAMES.map((name, index) => [name, (50000 + index * 10000) * 100, index + 3, index + 1]));
  const event = { ...result.payload, endsAt: result.payload.endsAt ?? null, ticketTypes: result.payload.ticketTypes.map((t, i) => ({ ...t, id: `tier-${i}`, soldCount: 0, reservedCount: 0, availableCount: t.capacity })) };
  const edited = buildAdminEventPayload(getEventForm(event));
  assert.equal(edited.ok, true);
  assert.deepEqual(edited.payload.ticketTypes, result.payload.ticketTypes);
  const tableOnly = validForm(); tableOnly.ticketTiers["Table of 10"].priceNaira = "150000";
  assert.deepEqual(buildAdminEventPayload(tableOnly).payload.ticketTypes.map((t) => t.name), ["Table of 10"]);
});

test("table stock and ownership limits apply per size, preserving ordinary tickets and historical Tables", () => {
  const tier = (name, id, limit) => ({ id, name, priceKobo: 5000000, capacity: 10, availableCount: 10, maxTicketsPerUser: limit, soldCount: 0, reservedCount: 0 });
  const four = tier("Table of 4", "four", 1), ten = tier("Table of 10", "ten", 2), legacy = tier("Tables", "legacy", 1);
  const event = { status: "PUBLISHED", startsAt: "2099-10-31T16:00Z", endsAt: null, ticketTypes: [ten, legacy, four], userTickets: [{ id: "owned", status: "PAID", ticketType: four }] };
  assert.equal(getMaxPurchaseQuantity(event, four), 0);
  assert.equal(getMaxPurchaseQuantity(event, ten), 2);
  assert.equal(getEventTicketAvailability({ ...event, ticketTypes: [{ ...four, availableCount: 0 }, ten] }, false).canBookMore, true);
  assert.deepEqual(getEventTicketTypes(event).map((t) => t.name), ["Table of 4", "Table of 10", "Tables"]);
  assert.equal(normalizeTicketTierName("Table of 8"), "Table of 8");
  assert.equal(normalizeTicketTierName("General Admission"), "Regular");
  assert.deepEqual(TABLE_TICKET_TIER_NAMES.map(getTableSize), [4, 5, 6, 8, 10]);
  assert.equal(getTableSize("Tables"), null);
  const form = getEventForm({ ...validForm(), endsAt: null, ticketTypes: [legacy] });
  assert.equal(buildAdminEventPayload(form).payload.ticketTypes[0].name, "Tables");
});

test("invalid table stock or per-size maxima fail validation; free events remain Regular", () => {
  for (const patch of [{ capacity: "0" }, { maxTicketsPerUser: "0" }, { capacity: "1", maxTicketsPerUser: "2" }]) {
    const form = validForm(); Object.assign(form.ticketTiers["Table of 6"], { priceNaira: "90000", ...patch });
    const result = buildAdminEventPayload(form); assert.equal(result.ok, false); assert.match(result.error, /Table of 6/);
  }
  assert.deepEqual(buildAdminEventPayload(validForm()).payload.ticketTypes.map((t) => [t.name, t.priceKobo]), [["Regular", 0]]);
});
