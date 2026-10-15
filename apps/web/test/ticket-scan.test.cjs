require("./register-typescript.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ticketCodeFromScan } = require("../src/features/events/ticket-scan.ts");

test("scanner accepts CCL and historical ticket codes with case and whitespace normalization", () => {
  assert.equal(ticketCodeFromScan("  ccltix-a7b93f120d\n"), "CCLTIX-A7B93F120D");
  assert.equal(ticketCodeFromScan("STZTIX-ABCDEF1234"), "STZTIX-ABCDEF1234");
});
test("scanner rejects links, personal data, scripts and oversized QR payloads", () => {
  for (const input of ["https://example.com/ticket", "javascript:alert(1)", '{"code":"CCLTIX-ABCDEF"}',
    "guest@example.com", "abc", "A".repeat(101), "CCLTIX-ABC DEF", "CCLTIX-ABC\u0000DEF"]) {
    assert.equal(ticketCodeFromScan(input), null);
  }
});
