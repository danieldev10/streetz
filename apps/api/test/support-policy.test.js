const assert = require("node:assert/strict");
const test = require("node:test");
const { SupportPriority, SupportRequestCategory } = require("@prisma/client");
const { getInitialSupportPriority } = require("../dist/src/support/support-policy.js");

test("safety support requests are automatically urgent", () => {
  assert.equal(
    getInitialSupportPriority(SupportRequestCategory.SAFETY_REPORT),
    SupportPriority.URGENT
  );
});

test("payment and ticket support requests start high priority", () => {
  assert.equal(
    getInitialSupportPriority(SupportRequestCategory.MEMBERSHIP_PAYMENT),
    SupportPriority.HIGH
  );
  assert.equal(
    getInitialSupportPriority(SupportRequestCategory.EVENTS_TICKETS),
    SupportPriority.HIGH
  );
  assert.equal(
    getInitialSupportPriority(SupportRequestCategory.GUEST_TICKETS),
    SupportPriority.HIGH
  );
});

test("ordinary support requests start at normal priority", () => {
  assert.equal(
    getInitialSupportPriority(SupportRequestCategory.TECHNICAL),
    SupportPriority.NORMAL
  );
});
