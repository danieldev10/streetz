require("./register-typescript.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const { platformGroup, deferred, auth } = require("./session-fixture.cjs");
const group = platformGroup(), platform = group.make();
global.window = { localStorage: platform.storage, addEventListener() {} };
Object.defineProperty(global, "navigator", { value: { locks: platform.locks }, configurable: true });
global.BroadcastChannel = undefined;
const api = require("../src/lib/api.ts");
const { getBrowserSession } = require("../src/lib/browser-session.ts");
const { SessionChangedError } = require("../src/lib/api-error.ts");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("API retries one expired bearer with a cookie refresh, even with lower-case headers", async () => {
  const old = auth("member", -1, "old"), fresh = auth("member", 900, "new");
  await getBrowserSession().authenticate(async () => old);
  const calls = [];
  global.fetch = async (url, options) => {
    const headers = new Headers(options.headers);
    calls.push({ url, bearer: headers.get("authorization"), options });
    if (url.endsWith("/auth/refresh")) return json(fresh);
    if (headers.get("authorization") === "Bearer " + old.accessToken) return json({ message: "expired" }, 401);
    return json({ works: true });
  };
  assert.deepEqual(await api.apiRequest("/protected", { headers: { authorization: "Bearer " + old.accessToken } }), { works: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].bearer, "Bearer " + fresh.accessToken);
  assert.equal(calls[1].options.credentials, "include");
  assert.equal(new Headers(calls[1].options.headers).get("x-crushclub-client"), "web");
});

test("login installs memory credentials and never persists its response", async () => {
  const response = auth("new-account");
  global.fetch = async () => json(response);
  const data = await api.apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email: "new-account@example.test" }) });
  assert.deepEqual(data, response);
  assert.equal(getBrowserSession().current.user.id, "new-account");
  assert.ok(![...group.values.values()].join("").includes(response.accessToken));
});

test("a component from another account cannot send an action with the current account", async () => {
  let called = false;
  global.fetch = async () => { called = true; return json({}); };
  await assert.rejects(api.apiRequest("/protected", { method: "POST", headers: api.authHeaders(auth("old-account").accessToken) }), SessionChangedError);
  assert.equal(called, false);
});

test("logout while a response body is loading discards private response data", async () => {
  const response = auth("member"); await getBrowserSession().authenticate(async () => response);
  const body = deferred(), started = deferred();
  global.fetch = async (url) => url.endsWith("/auth/logout") ? json({ loggedOut: true }) : {
    ok: true, status: 200, json: () => { started.resolve(); return body.promise; },
  };
  const pending = api.apiRequest("/protected", { headers: api.authHeaders(response.accessToken) });
  await started.promise;
  await api.revokeRefreshSession();
  body.resolve({ secret: "old-account-data" });
  await assert.rejects(pending, SessionChangedError);
  assert.equal(getBrowserSession().current, null);
});

test("a Redis outage during refresh is surfaced without erasing the session", async () => {
  const response = auth("member", -1); await getBrowserSession().authenticate(async () => response);
  global.fetch = async (url) => url.endsWith("/auth/refresh") ? json({ message: "Protection unavailable" }, 503) : json({}, 401);
  await assert.rejects(api.apiRequest("/protected", { headers: api.authHeaders(response.accessToken) }), (error) => error.status === 503);
  assert.ok(getBrowserSession().current);
});

