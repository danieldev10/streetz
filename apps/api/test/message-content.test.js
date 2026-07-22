const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMessageContent } = require("../dist/src/common/message-content.js");

test("message content accepts emoji-only text", () => {
  assert.deepEqual(normalizeMessageContent("  🥳  "), { body: "🥳", gifUrl: null });
});

test("message content accepts a GIPHY GIF without text", () => {
  assert.deepEqual(
    normalizeMessageContent("", "https://media2.giphy.com/media/abc/giphy.gif"),
    { body: "", gifUrl: "https://media2.giphy.com/media/abc/giphy.gif" }
  );
});

test("message content rejects arbitrary remote media", () => {
  assert.throws(
    () => normalizeMessageContent("", "https://example.com/tracking.gif"),
    /Only GIPHY GIFs are supported/
  );
});
