import assert from "node:assert/strict";
import test from "node:test";

// Temporary gate-proof branch only. This file must never be merged.
test("intentional release gate failure blocks promotion to main", () => {
  assert.fail("Expected gate-proof failure: Release checks must prevent this branch from merging.");
});
