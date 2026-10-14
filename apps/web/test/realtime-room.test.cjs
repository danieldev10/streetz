require("./register-typescript.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EventEmitter } = require("node:events");
const { bindRealtimeRoom } = require("../src/lib/realtime-room.ts");

function fixtureSocket() {
  const socket = new EventEmitter();
  socket.connected = false;
  socket.joins = [];
  socket.leaves = [];
  socket.timeout = () => ({ emit: (event, payload, callback) => socket.joins.push({ event, payload, callback }) });
  socket.emit = (event, payload) => socket.leaves.push({ event, payload });
  socket.connectNow = () => { socket.connected = true; EventEmitter.prototype.emit.call(socket, "connect"); };
  socket.disconnectNow = () => { socket.connected = false; EventEmitter.prototype.emit.call(socket, "disconnect"); };
  return socket;
}
function bind(socket, callbacks = {}) {
  return bindRealtimeRoom(socket, { joinEvent: "room:join", leaveEvent: "room:leave", payload: { roomId: "room" },
    onJoined: () => {}, onError: () => {}, ...callbacks });
}

test("a chat restores its subscription and fetches history only after each successful rejoin", () => {
  const socket = fixtureSocket();
  let recovered = 0;
  const unbind = bind(socket, { onJoined: () => recovered++ });
  assert.equal(socket.joins.length, 0);
  socket.connectNow();
  assert.equal(socket.joins.length, 1);
  assert.equal(recovered, 0);
  socket.joins[0].callback(null, { ok: true });
  assert.equal(recovered, 1);
  socket.disconnectNow();
  socket.connectNow();
  socket.joins[1].callback(null, { ok: true });
  assert.equal(recovered, 2);
  unbind();
  assert.equal(socket.leaves[0].event, "room:leave");
  socket.disconnectNow(); socket.connectNow();
  assert.equal(socket.joins.length, 2);
});

test("late joins cannot recover a departed thread or leave a room on a later connection", () => {
  const socket = fixtureSocket();
  socket.connectNow();
  let recovered = 0;
  const unbind = bind(socket, { onJoined: () => recovered++ });
  socket.disconnectNow(); unbind();
  socket.joins[0].callback(null, { ok: true });
  socket.connectNow();
  assert.equal(recovered, 0);
  assert.deepEqual(socket.leaves, []);
});

test("transient join failures retry, permission failures do not, and cleanup cancels retries", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const socket = fixtureSocket(); socket.connectNow();
  const errors = [];
  const unbind = bind(socket, { onError: (message) => errors.push(message) });
  socket.joins[0].callback(new Error("timeout"));
  t.mock.timers.tick(2_000);
  assert.equal(socket.joins.length, 2);
  socket.joins[1].callback(null, { ok: false, error: "Not a participant" });
  t.mock.timers.tick(10_000);
  assert.equal(socket.joins.length, 2);
  assert.equal(errors.at(-1), "Not a participant");
  socket.disconnectNow(); socket.connectNow();
  socket.joins[2].callback(null, { ok: false, retryable: true });
  unbind(); t.mock.timers.tick(10_000);
  assert.equal(socket.joins.length, 3);
});
