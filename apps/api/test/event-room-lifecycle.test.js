const assert = require("node:assert/strict");
const test = require("node:test");
const { EventStatus } = require("@prisma/client");
const {
  EVENT_ROOM_GRACE_PERIOD_MS,
  getEventRoomClosesAt,
  isEventRoomAvailable,
} = require("../dist/src/rooms/event-room-lifecycle.js");

const eventEnd = new Date("2026-09-16T18:00:00.000Z");
const publishedEvent = {
  startsAt: new Date("2026-09-16T15:00:00.000Z"),
  endsAt: eventEnd,
  status: EventStatus.PUBLISHED,
};

test("event rooms close exactly 24 hours after the event ends", () => {
  const closesAt = getEventRoomClosesAt(publishedEvent);

  assert.equal(closesAt.getTime(), eventEnd.getTime() + EVENT_ROOM_GRACE_PERIOD_MS);
  assert.equal(isEventRoomAvailable(publishedEvent, new Date(closesAt.getTime() - 1)), true);
  assert.equal(isEventRoomAvailable(publishedEvent, closesAt), false);
});

test("events without an end time use their start time for the room cutoff", () => {
  const event = { ...publishedEvent, endsAt: null };

  assert.equal(
    getEventRoomClosesAt(event).getTime(),
    event.startsAt.getTime() + EVENT_ROOM_GRACE_PERIOD_MS
  );
});

test("draft and cancelled event rooms are never available", () => {
  const beforeCutoff = new Date(eventEnd.getTime() + EVENT_ROOM_GRACE_PERIOD_MS - 1);

  assert.equal(isEventRoomAvailable({ ...publishedEvent, status: EventStatus.DRAFT }, beforeCutoff), false);
  assert.equal(isEventRoomAvailable({ ...publishedEvent, status: EventStatus.CANCELLED }, beforeCutoff), false);
});
