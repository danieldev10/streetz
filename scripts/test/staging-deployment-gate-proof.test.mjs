import assert from "node:assert/strict";
import test from "node:test";

// Temporary staging deployment-gate drill. Revert after the blocked release is observed.
test("staging deployment gates reject an intentionally failed CI run", () => {
  assert.fail("Expected staging gate-proof failure: Railway and Vercel must keep the previous deployment active.");
});
