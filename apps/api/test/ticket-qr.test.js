const assert = require("node:assert/strict");
const { test } = require("node:test");
const sharp = require("sharp");
const jsQR = require("jsqr");
const { renderTicketQr } = require("../dist/src/tickets/ticket-qr.js");
const { renderTicketPdf } = require("../dist/src/tickets/ticket-pdf.js");
const { inflateSync } = require("node:zlib");

test("ticket QR images decode to the exact admission code, including existing STZ tickets", async () => {
  for (const code of ["CCLTIX-A7B93F120D", "STZTIX-1234567890"]) {
    const png = await renderTicketQr(code);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    assert.equal(decoded?.data, code);
  }
});

test("table PDFs state the group size and retain one single-use QR per purchased table", async () => {
  const sizes = [4, 5, 6, 8, 10];
  const pdf = await renderTicketPdf({ eventTitle: "Table ticket fixture", venue: "Lagos", displayName: "Table holder", startsAt: new Date("2027-01-01T18:00:00Z"),
    tickets: sizes.map((size) => ({ code: `CCLTIX-TABLE${size}`, tier: `Table of ${size}`, status: "PAID" })) });
  const raw = pdf.toString("latin1");
  assert.equal((raw.match(/\/Type \/Page\b/g) ?? []).length, sizes.length);
  const text = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap((match) => {
    try { return [...inflateSync(Buffer.from(match[1], "latin1")).toString("latin1").matchAll(/<([0-9a-f]+)>/gi)].map((part) => Buffer.from(part[1], "hex").toString("latin1")); }
    catch { return []; }
  }).join("").replace(/\s+/g, " ");
  for (const size of sizes) assert.ok(text.includes(`This table ticket admits ${size} people.`), `PDF missing admission count for ${size}`);
  assert.ok(text.includes("Check in the table group together"));
  assert.ok(!text.includes("Each ticket admits one person"));
});

test("each usable ticket gets its own embedded QR in the PDF; cancelled and used tickets do not", async () => {
  const input = { eventTitle: "Community night", venue: "Lagos", displayName: "Guest", startsAt: new Date("2027-01-01T18:00:00Z"),
    tickets: [{ code: "CCLTIX-1234567890", tier: "Regular", status: "PAID" }, { code: "CCLTIX-ABCDEF1234", tier: "VIP", status: "CONFIRMED" }] };
  const pdf = await renderTicketPdf(input);
  const count = (buffer, regex) => (buffer.toString("latin1").match(regex) ?? []).length;
  assert.equal(count(pdf, /\/Type \/Page\b/g), 2);
  assert.ok(count(pdf, /\/Subtype \/Image/g) >= 2);
  for (const status of ["CHECKED_IN", "CANCELLED", "REFUNDED", "RESERVED"]) {
    const invalid = await renderTicketPdf({ ...input, tickets: [{ ...input.tickets[0], status }] });
    assert.equal(count(invalid, /\/Subtype \/Image/g), 0);
  }
  const cancelledEvent = await renderTicketPdf({ ...input, eventCancelled: true });
  assert.equal(count(cancelledEvent, /\/Subtype \/Image/g), 0);
});
