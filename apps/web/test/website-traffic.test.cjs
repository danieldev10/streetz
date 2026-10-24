const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
require("./register-typescript.cjs");
const { WebsiteTrafficTracker, VISIT_IDLE_MS, sendPageView, trafficPage, trafficHost } = require("../src/lib/website-traffic.ts");

test("route rerenders/focus deduplicate; navigation, reload and inactive returns count correctly", async () => {
  let now = 1000000000, stored = null;
  const views = [];
  const platform = { now: () => now, id: randomUUID, read: () => stored, write: (value) => { stored = value; }, send: async (view, token) => { views.push({ ...view, member: !!token }); } };
  const one = new WebsiteTrafficTracker(platform);
  await one.view("/events", "LANDING");
  await one.view("/events", "LANDING");
  assert.equal(views.length, 1);
  await one.view("auth:login", "LOGIN");
  await one.view("auth:register", "SIGNUP");
  await one.view("/events", "LANDING", "access-token");
  await one.view("/events", "LANDING", "rotated-access-token");
  assert.equal(views.length, 4);
  const two = new WebsiteTrafficTracker(platform);
  await two.view("/events", "LANDING", "access-token");
  assert.equal(views[4].visitId, views[0].visitId, "reloads and other tabs share the visit");
  now += VISIT_IDLE_MS + 1;
  await one.view("/events", "LANDING", "access-token");
  assert.notEqual(views[5].visitId, views[0].visitId);
  assert.ok(views.every((view) => Object.keys(view).sort().join() === "eventId,member,pageKind,visitId"));
  assert.ok(!stored.includes("/events") && !stored.includes("access-token"));
});

test("activity extends a visit and denied/malformed storage falls back to memory", async () => {
  let now = 1000000000;
  const views = [];
  const tracker = new WebsiteTrafficTracker({ now: () => now, id: randomUUID, read: () => { throw new Error("denied"); }, write: () => { throw new Error("denied"); }, send: async (view) => { views.push(view); } });
  await tracker.view("/events", "LANDING");
  now += 20 * 60000; tracker.touch();
  now += 20 * 60000; await tracker.view("/discover", "OTHER");
  assert.equal(views[0].visitId, views[1].visitId);
});

test("analytics retries once with the same IDs; unauthorized/rate limits never trigger auth or retries", async () => {
  const view = { eventId: randomUUID(), visitId: randomUUID(), pageKind: "LOGIN" }, requests = [];
  await sendPageView("/api/analytics/page-view", view, "token", async (url, options) => {
    requests.push({ url, options }); return { status: requests.length === 1 ? 503 : 204 };
  }, async () => {});
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.body, requests[1].options.body);
  assert.equal(requests[0].options.credentials, "omit");
  for (const status of [401, 403, 429]) {
    let calls = 0;
    await sendPageView("/count", view, undefined, async () => { calls++; return { status }; });
    assert.equal(calls, 1);
  }
  let failed = 0;
  await sendPageView("/count", view, undefined, async () => { failed++; throw new Error("offline"); }, async () => {});
  assert.equal(failed, 2);
});

test("only canonical hosts count; administrative routes are excluded and queries aren't needed", () => {
  assert.equal(trafficPage("/events"), "LANDING");
  for (const path of ["/admin", "/admin/support", "/users", "/reports/one", "/events/create", "/events/one/edit", "/check-in"]) assert.equal(trafficPage(path), null);
  for (const host of ["crushclub.ng", "www.crushclub.ng", "staging.crushclub.ng"]) assert.equal(trafficHost(host), true);
  for (const host of ["localhost", "crushclub-preview.vercel.app", "crushclub.ng.attacker.test"]) assert.equal(trafficHost(host), false);
});
