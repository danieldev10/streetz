const assert = require("node:assert/strict");
const test = require("node:test");
const { getCheckedInStandardEventCounts } = require("../dist/src/common/attendance.js");

test("attendance counts are batched and distinct events are counted per user", async () => {
  const calls = [];
  const client = {
    ticket: {
      async findMany(args) {
        calls.push(args);
        return [
          { userId: "user-a", eventId: "event-1" },
          { userId: "user-a", eventId: "event-2" },
          { userId: "user-b", eventId: "event-2" }
        ];
      }
    }
  };

  const counts = await getCheckedInStandardEventCounts(client, ["user-a", "user-b", "user-c", "user-a"]);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where.userId.in, ["user-a", "user-b", "user-c"]);
  assert.deepEqual(calls[0].distinct, ["userId", "eventId"]);
  assert.equal(counts.get("user-a"), 2);
  assert.equal(counts.get("user-b"), 1);
  assert.equal(counts.get("user-c"), 0);
});

test("attendance batching skips the database for an empty collection", async () => {
  const client = {
    ticket: {
      async findMany() {
        throw new Error("findMany should not be called");
      }
    }
  };

  const counts = await getCheckedInStandardEventCounts(client, []);

  assert.equal(counts.size, 0);
});
