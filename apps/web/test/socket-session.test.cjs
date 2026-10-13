require("./register-typescript.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const { platformGroup, deferred, auth, tick } = require("./session-fixture.cjs");
const platform = platformGroup().make();
global.window = { localStorage: platform.storage, addEventListener() {} };
Object.defineProperty(global, "navigator", { value: { locks: platform.locks }, configurable: true });
global.BroadcastChannel = undefined;
const sockets = [];
const realLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === "socket.io-client") return { io: (_url, options) => {
    const socket = new EventEmitter();
    socket.options = options; socket.connects = 0;
    socket.connect = () => { socket.connects++; };
    socket.disconnect = () => socket.emit("disconnect", "io client disconnect");
    sockets.push(socket); return socket;
  }};
  return realLoad.call(this, name, ...args);
};
const { createAuthenticatedSocket } = require("../src/lib/authenticated-socket.ts");
const { getBrowserSession } = require("../src/lib/browser-session.ts");
Module._load = realLoad;
const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

test("socket handshakes read the current memory token, including after a fresh login", async () => {
  const session = getBrowserSession();
  await session.authenticate(async () => auth("one"));
  const socket = createAuthenticatedSocket();
  let sent;
  socket.options.auth((value) => { sent = value; });
  assert.equal(sent.token, session.current.accessToken);
  await session.authenticate(async () => auth("two"));
  socket.options.auth((value) => { sent = value; });
  assert.equal(sent.token, session.current.accessToken);
  socket.disconnect();
});

test("expiring socket handshakes refresh through the shared cookie coordinator", async () => {
  const session = getBrowserSession();
  await session.authenticate(async () => auth("member", 10));
  const fresh = auth("member");
  let calls = 0;
  global.fetch = async () => { calls++; return json(fresh); };
  const a = createAuthenticatedSocket(), b = createAuthenticatedSocket();
  const handshake = (socket) => new Promise((resolve) => socket.options.auth(resolve));
  const responses = await Promise.all([handshake(a), handshake(b)]);
  assert.equal(calls, 1);
  assert.ok(responses.every((response) => response.token === fresh.accessToken));
  a.disconnect(); b.disconnect();
});

test("server expiry reconnects once, but client cleanup prevents a delayed refresh from reconnecting", async () => {
  const session = getBrowserSession();
  await session.authenticate(async () => auth("member", -1));
  const network = deferred(), started = deferred();
  let calls = 0;
  global.fetch = async () => { calls++; started.resolve(); return network.promise; };
  const socket = createAuthenticatedSocket();
  socket.emit("auth:expired");
  socket.emit("disconnect", "io server disconnect");
  await started.promise;
  network.resolve(json(auth("member"))); await tick();
  assert.equal(calls, 1); assert.equal(socket.connects, 1);
  socket.disconnect();

  await session.authenticate(async () => auth("member", -1));
  const late = deferred(), lateStart = deferred();
  global.fetch = async () => { lateStart.resolve(); return late.promise; };
  const removed = createAuthenticatedSocket();
  removed.emit("auth:expired"); await lateStart.promise;
  removed.disconnect();
  late.resolve(json(auth("member"))); await tick();
  assert.equal(removed.connects, 0);
});

