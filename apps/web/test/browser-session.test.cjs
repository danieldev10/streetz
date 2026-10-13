require("./register-typescript.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const { BrowserSession, SESSION_REVISION_KEY, tokenExpiresSoon } = require("../src/lib/browser-session.ts");
const { ApiError, SessionChangedError } = require("../src/lib/api-error.ts");
const { platformGroup, deferred, auth, tick } = require("./session-fixture.cjs");

test("credentials remain in memory, old storage tokens disappear, and reload uses cookie refresh", async () => {
  const group = platformGroup(), platform = group.make();
  platform.storage.setItem("streetz_access_token", "old-secret");
  platform.storage.setItem("access_token", "old-secret");
  const session = new BrowserSession(platform);
  const response = auth();
  await session.authenticate(async () => response);
  assert.equal(session.current.accessToken, response.accessToken);
  assert.deepEqual([...group.values.keys()], [SESSION_REVISION_KEY]);
  assert.ok(![...group.values.values()].join("").includes(response.accessToken));
  assert.ok(![...group.values.values()].join("").includes(response.user.email));
  const reloaded = new BrowserSession(group.make());
  assert.equal(reloaded.current, null);
  await reloaded.refresh(async () => response);
  assert.equal(reloaded.current.user.id, "member");
});

for (const webLocks of [true, false]) {
  test("refreshes serialize across tabs and coalesce inside a tab: " + (webLocks ? "Web Locks" : "Safari fallback"), async () => {
    const group = platformGroup({ webLocks }), first = new BrowserSession(group.make()), second = new BrowserSession(group.make());
    let cookie = 0, active = 0, peak = 0, calls = 0;
    const request = async () => {
      const seen = cookie;
      calls++; peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(cookie, seen, "refresh cookie must not rotate underneath a request");
      cookie++; active--;
      return auth("member", 900, String(cookie));
    };
    const results = await Promise.all([first.refresh(request), first.refresh(request), second.refresh(request)]);
    assert.equal(calls, 2);
    assert.equal(peak, 1);
    assert.equal(results[0].accessToken, results[1].accessToken);
    assert.equal(cookie, 2);
    assert.ok(first.current && second.current);
    assert.ok(![...group.values.keys()].some((key) => key.includes("lock")));
  });
}

test("logout interrupts an in-flight refresh, clears every tab and survives offline reload", async () => {
  const group = platformGroup(), first = new BrowserSession(group.make()), second = new BrowserSession(group.make());
  await first.authenticate(async () => auth()); await tick();
  await second.refresh(async () => auth());
  const network = deferred(), started = deferred();
  const refreshing = first.refresh(async () => { started.resolve(); return network.promise; });
  await started.promise;
  const logout = second.logout(async () => { throw new Error("offline"); });
  const rejected = assert.rejects(refreshing, SessionChangedError);
  await tick();
  assert.equal(first.current, null);
  network.resolve(auth());
  await rejected;
  await assert.rejects(logout, /offline/);
  assert.equal(second.current, null);
  const reloaded = new BrowserSession(group.make());
  let called = false;
  await assert.rejects(reloaded.refresh(async () => { called = true; return auth(); }), (error) => error.status === 401);
  assert.equal(called, false);
  await reloaded.authenticate(async () => auth("new-member"));
  assert.equal(reloaded.current.user.id, "new-member");
});

test("a new login fences old requests and a 401 cannot erase the new account", async () => {
  const group = platformGroup(), first = new BrowserSession(group.make()), second = new BrowserSession(group.make());
  await first.authenticate(async () => auth("old")); await tick();
  const oldRevision = first.version;
  await second.authenticate(async () => auth("new")); await tick();
  assert.equal(first.current, null);
  assert.throws(() => first.updateUser(auth("old").user, oldRevision), SessionChangedError);
  await first.refresh(async () => auth("new"));
  first.expire(oldRevision);
  assert.equal(first.current.user.id, "new");
});

test("temporary network/503 failures preserve credentials; authoritative 401 clears them", async () => {
  const session = new BrowserSession(platformGroup().make());
  await session.authenticate(async () => auth());
  await assert.rejects(session.refresh(async () => { throw new ApiError("Unavailable", 503); }), /Unavailable/);
  assert.ok(session.current);
  await assert.rejects(session.refresh(async () => { throw new TypeError("offline"); }), /offline/);
  assert.ok(session.current);
  await assert.rejects(session.refresh(async () => { throw new ApiError("Expired", 401); }), /Expired/);
  assert.equal(session.current, null);
});

test("fallback clears abandoned locks and fails safely if coordination is unavailable", async () => {
  const group = platformGroup({ webLocks: false });
  group.values.set("crushclub_auth_lock_v1:abandoned", JSON.stringify({ ticket: 1, choosing: true, expires: Date.now() - 1 }));
  const session = new BrowserSession(group.make());
  await session.refresh(async () => auth());
  assert.equal(group.values.size, 0);
  const unavailable = new BrowserSession({ id: () => "tab", listenStorage() {} });
  await assert.rejects(unavailable.refresh(async () => auth()), (error) => error.status === 503);
  const blockedPlatform = group.make();
  blockedPlatform.storage.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  const blocked = new BrowserSession(blockedPlatform);
  await assert.rejects(blocked.refresh(async () => auth()), (error) => error.status === 503);
});

test("expiry scheduling refreshes malformed or expiring tokens and leaves fresh tokens alone", () => {
  assert.equal(tokenExpiresSoon("bad"), true);
  assert.equal(tokenExpiresSoon(auth("member", 30).accessToken), true);
  assert.equal(tokenExpiresSoon(auth("member", 900).accessToken), false);
});

test("request deadlines also work when the browser lacks AbortSignal.timeout", async () => {
  const { timeoutSignal } = require("../src/lib/request-timeout.ts");
  const original = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const signal = timeoutSignal(5);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, "TimeoutError");
  } finally { AbortSignal.timeout = original; }
});

test("full localStorage cannot resurrect a stale logout marker over a newer in-memory login", async () => {
  const group = platformGroup(), platform = group.make();
  platform.storage.setItem(SESSION_REVISION_KEY, JSON.stringify({ id: "old", kind: "logout" }));
  const session = new BrowserSession(platform);
  platform.storage.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); };
  await session.authenticate(async () => auth());
  const version = session.version;
  assert.notEqual(version, "old");
  assert.equal(session.current.user.id, "member");
  await session.refresh(async () => auth());
  await session.logout(async () => {});
  assert.equal(session.current, null);
});
