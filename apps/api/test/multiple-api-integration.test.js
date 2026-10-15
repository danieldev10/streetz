const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { fork } = require("node:child_process");
const { once } = require("node:events");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { JwtService } = require("@nestjs/jwt");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { io } = require("socket.io-client");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const origin = "http://127.0.0.1:3000";
async function eventually(check, label, timeout = 10_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await delay(25); }
  throw new Error("Timed out: " + label);
}
function ipc(child, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Replica IPC timeout")), 20_000);
    const message = (value) => { if (predicate(value)) finish(null, value); };
    const exited = (code) => finish(new Error("Replica exited: " + code));
    const finish = (error, value) => {
      clearTimeout(timer); child.off("message", message); child.off("exit", exited);
      error ? reject(error) : resolve(value);
    };
    child.on("message", message); child.once("exit", exited);
  });
}
function acknowledgement(socket, event, body) {
  return new Promise((resolve, reject) => socket.timeout(10_000).emit(event, body,
    (error, result) => error ? reject(error) : resolve(result)));
}
async function openSocket(url, token) {
  const socket = io(url, { transports: ["websocket"], forceNew: true, autoConnect: false,
    extraHeaders: { Origin: origin }, ...(token ? { auth: { token } } : {}),
    reconnectionDelay: 100, reconnectionDelayMax: 300 });
  const connected = once(socket, "connect");
  const failed = once(socket, "connect_error").then(([error]) => { throw error; });
  socket.connect();
  await Promise.race([connected, failed]);
  return socket;
}
// Stable public address forwarding a WebSocket to a selected test replica.
// Switching target models Railway routing a reconnect to a surviving instance.
async function makeProxy(getTarget) {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const target = new URL(getTarget());
    const upstream = http.request({ hostname: target.hostname, port: target.port, path: request.url,
      method: request.method, headers: { ...request.headers, host: target.host } }, (reply) => {
      response.writeHead(reply.statusCode, reply.headers); reply.pipe(response);
    });
    upstream.on("error", () => { response.writeHead(503); response.end(); });
    request.pipe(upstream);
  });
  server.on("upgrade", (request, socket, head) => {
    const target = new URL(getTarget());
    const upstream = net.connect(Number(target.port), target.hostname);
    for (const connection of [socket, upstream]) {
      sockets.add(connection); connection.on("close", () => sockets.delete(connection));
      connection.on("error", () => { socket.destroy(); upstream.destroy(); });
    }
    upstream.once("connect", () => {
      const headers = Object.entries({ ...request.headers, host: target.host }).map(([key, value]) => key + ": " + value).join("\r\n");
      upstream.write(request.method + " " + request.url + " HTTP/1.1\r\n" + headers + "\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: "http://127.0.0.1:" + server.address().port, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  } };
}

test("two real API processes share messages, limits and ticket transactions and drain before stopping", {
  skip: !process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL, timeout: 90_000,
}, async (t) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const prefix = randomUUID();
  const accessSecret = "replica-access-" + prefix;
  const refreshSecret = "replica-refresh-" + prefix;
  const children = [], clients = [], users = [], events = [];
  let proxy;
  const createUser = async (name) => {
    const user = await prisma.user.create({ data: { email: name + "-" + prefix + "@example.test", displayName: name,
      passwordHash: "unused", subscriptionStatus: "ACTIVE", subscriptionEndsAt: new Date(Date.now() + 86_400_000),
      profile: { create: { bio: "A synthetic complete profile", birthDate: new Date("1998-01-01"),
        city: "Lagos", state: "Lagos", connectionStatus: "CHILL", interests: ["Music"] } },
      photos: { create: { url: "https://cdn.example/test.jpg", slot: 0, sortOrder: 0 } } } });
    users.push(user.id);
    const token = new JwtService().sign({ sub: user.id, email: user.email, role: "USER" }, { secret: accessSecret, expiresIn: "15m" });
    return { ...user, token };
  };
  const startReplica = async () => {
    const child = fork(path.join(__dirname, "fixtures/api-replica.cjs"), [], { cwd: path.join(__dirname, ".."),
      env: { ...process.env, NODE_ENV: "test", PORT: "0", WEB_APP_URL: origin,
        JWT_ACCESS_SECRET: accessSecret, JWT_REFRESH_SECRET: refreshSecret, REPLICA_TEST_PREFIX: prefix,
        API_SHUTDOWN_TIMEOUT_MS: "10000", DB_POOL_MAX: "5", S3_BUCKET: "fixture-bucket", S3_REGION: "eu-west-1",
        S3_ACCESS_KEY_ID: "fixture-key", S3_SECRET_ACCESS_KEY: "fixture-secret", AWS_EC2_METADATA_DISABLED: "true",
        PAYSTACK_SECRET_KEY: "fixture-paystack", SMTP_FROM: "fixture@example.test",
        FACE_VERIFICATION_MODE: "enforce", FACE_VERIFICATION_REQUIRED: "true", AWS_VERIFICATION_BUCKET: "fixture-verification" },
      stdio: ["ignore", "pipe", "pipe", "ipc"] });
    children.push(child);
    let diagnostics = "";
    const record = (chunk) => { diagnostics = (diagnostics + chunk).slice(-6_000); };
    child.stdout.on("data", record); child.stderr.on("data", record);
    try { return { child, diagnostics: () => diagnostics, ...await ipc(child, (message) => message.event === "ready") }; }
    catch (error) { throw new Error(error.message + "\n" + diagnostics); }
  };
  let forwarded = 0;
  const request = (replica, endpoint, user, body) => fetch(replica.url + "/api" + endpoint, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(15_000),
    headers: { origin, "content-type": "application/json", "x-crushclub-client": "web",
      "x-forwarded-for": "192.0.2." + (++forwarded % 200 + 1), ...(user ? { authorization: "Bearer " + user.token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const [a, b] = await Promise.all([startReplica(), startReplica()]);
    assert.notEqual(a.instanceId, b.instanceId);
    await eventually(async () => (await request(a, "/health/ready")).status === 200 && (await request(b, "/health/ready")).status === 200, "both replicas ready");
    assert.equal((await request(a, "/health/ready")).headers.get("x-crushclub-instance"), a.instanceId);
    assert.equal((await request(b, "/health/ready")).headers.get("x-crushclub-instance"), b.instanceId);
    const alice = await createUser("Alice"), bob = await createUser("Bob");
    const [userAId, userBId] = [alice.id, bob.id].sort();
    const match = await prisma.match.create({ data: { userAId, userBId, status: "ACTIVE" } });
    let target = a.url;
    proxy = await makeProxy(() => target);
    const sender = await openSocket(proxy.url, alice.token), receiver = await openSocket(b.url, bob.token);
    clients.push(sender, receiver);

    await t.test("liveness is optional for discovery and introductions even with legacy enforcement variables", async () => {
      const verification = await request(a, "/verification/me", alice).then((response) => response.json());
      assert.equal(verification.required, false);
      assert.equal(verification.isVerified, false);
      assert.equal(verification.status, "NOT_STARTED");
      assert.equal((await request(a, "/discovery/people", alice)).status, 200);
      const profile = () => request(a, `/discovery/people/${bob.id}`, alice).then((response) => response.json());
      assert.equal((await profile()).isVerified, false);
      await prisma.user.update({ where: { id: bob.id }, data: { faceVerificationStatus: "VERIFIED", faceVerificationVerifiedAt: new Date() } });
      assert.equal((await profile()).isVerified, true);
      await prisma.user.update({ where: { id: bob.id }, data: { faceVerificationOverrideReason: "PROTOTYPE_BYPASS" } });
      assert.equal((await profile()).isVerified, false);
      await prisma.user.update({ where: { id: bob.id }, data: { faceVerificationStatus: "NOT_STARTED", faceVerificationVerifiedAt: null, faceVerificationOverrideReason: null } });
      const newcomer = await createUser("Newcomer");
      const introduction = await request(b, "/conversations/requests", newcomer, { targetUserId: alice.id, body: "Hello without a live selfie" });
      assert.equal(introduction.status, 201);
      assert.equal((await introduction.json()).created, true);
    });

    await t.test("messages cross API instances and polling/forged origins are rejected", async () => {
      assert.equal((await acknowledgement(sender, "match:join", { matchId: match.id })).ok, true);
      assert.equal((await acknowledgement(receiver, "match:join", { matchId: match.id })).ok, true);
      const incoming = once(receiver, "direct-message:new");
      const sent = await acknowledgement(sender, "direct-message:send", { matchId: match.id, body: "Across instances" });
      assert.equal(sent.ok, true);
      assert.equal((await incoming)[0].id, sent.message.id);
      const polling = await fetch(a.url + "/socket.io/?EIO=4&transport=polling");
      assert.equal(polling.status, 400);
      const denied = io(a.url, { transports: ["websocket"], reconnection: false, auth: { token: alice.token },
        extraHeaders: { Origin: "https://untrusted.example.test" } });
      clients.push(denied);
      await once(denied, "connect_error");
      assert.equal(denied.connected, false);
    });

    await t.test("subscribers without tickets can join paid-event rooms and send across replicas; guests stay read-only", async () => {
      const event = await prisma.event.create({ data: { title: "Replica event", slug: "replica-" + prefix,
        category: "Community", venue: "Test venue", city: "Lagos", startsAt: new Date(Date.now() + 86_400_000),
        status: "PUBLISHED", ticketTypes: { create: { name: "Regular", priceKobo: 500_000, capacity: 10 } },
        room: { create: { name: "Event room" } } },
        include: { room: true, ticketTypes: true } });
      events.push(event.id);
      assert.equal(await prisma.ticket.count({ where: { eventId: event.id } }), 0);
      const preview = await (await request(a, `/events/${event.id}/tickets`, alice)).json();
      assert.equal(preview.room.readOnly, false);
      const availableRooms = await (await request(a, "/rooms", alice)).json();
      assert.ok(availableRooms.rooms.some((room) => room.id === event.room.id));
      assert.equal((await request(a, `/rooms/${event.room.id}/join`, alice, {})).status, 201);
      assert.equal((await request(b, `/rooms/${event.room.id}/join`, bob, {})).status, 201);
      assert.equal((await acknowledgement(sender, "room:join", { roomId: event.room.id })).ok, true);
      assert.equal((await acknowledgement(receiver, "room:join", { roomId: event.room.id })).ok, true);
      const guest = await openSocket(b.url + "/public-rooms"); clients.push(guest);
      assert.equal((await acknowledgement(guest, "public-room:join", { roomId: event.room.id })).ok, true);
      const memberMessage = once(receiver, "room-message:new"), guestMessage = once(guest, "public-room-message:new");
      const sent = await acknowledgement(sender, "room-message:send", { roomId: event.room.id, body: "Hello event room" });
      assert.equal(sent.ok, true);
      assert.equal((await memberMessage)[0].id, sent.message.id);
      const publicMessage = (await guestMessage)[0];
      assert.equal(publicMessage.id, sent.message.id);
      assert.equal(publicMessage.author.email, undefined);
      const before = await prisma.chatMessage.count({ where: { roomId: event.room.id } });
      await assert.rejects(new Promise((resolve, reject) => guest.timeout(150).emit("room-message:send",
        { roomId: event.room.id, body: "Guest must not send" }, (error, value) => error ? reject(error) : resolve(value))));
      assert.equal(await prisma.chatMessage.count({ where: { roomId: event.room.id } }), before);
      assert.equal((await request(b, `/rooms/${event.room.id}/messages`, bob, { body: "HTTP chat before buying" })).status, 201);
      assert.equal((await request(b, `/rooms/${event.room.id}/messages`, null, { body: "Anonymous send" })).status, 401);
      await prisma.user.update({ where: { id: bob.id }, data: { subscriptionEndsAt: new Date(Date.now() - 1_000) } });
      assert.equal((await request(b, `/rooms/${event.room.id}/messages`, bob, { body: "Expired send" })).status, 403);
      assert.equal((await acknowledgement(receiver, "room-message:send", { roomId: event.room.id, body: "Expired socket send" })).ok, false);
      await prisma.user.update({ where: { id: bob.id }, data: { subscriptionEndsAt: new Date(Date.now() + 86_400_000) } });
    });

    await t.test("ordinary subscribers cannot open check-in or scan tickets", async () => {
      const eventId = events[0];
      assert.equal((await request(a, "/admissions/events", alice)).status, 403);
      assert.equal((await request(a, `/admissions/events/${eventId}`, alice)).status, 403);
      assert.equal((await request(a, `/admissions/events/${eventId}/check-in`, alice, { code: "CCLTIX-A7B93F120D" })).status, 403);
      assert.equal((await request(a, "/admissions/events")).status, 401);
    });

    await t.test("cancelling an event removes it from guest and member lists and closes its room", async () => {
      const event = await prisma.event.create({ data: { title: "Cancelled public event", slug: "cancel-" + prefix,
        category: "Community", description: "Full public event description", venue: "Test venue", city: "Lagos",
        startsAt: new Date(Date.now() + 86_400_000), status: "PUBLISHED",
        ticketTypes: { create: { name: "Regular", priceKobo: 0, capacity: 10 } },
        room: { create: { name: "Cancelled event room" } } }, include: { room: true } });
      events.push(event.id);
      const publicList = await request(a, "/public/events");
      assert.equal(publicList.headers.get("cache-control"), "no-store");
      assert.ok((await publicList.json()).events.some((item) => item.id === event.id));
      const detail = await request(a, `/public/events/${event.id}`);
      assert.equal(detail.headers.get("cache-control"), "no-store");
      assert.equal((await detail.json()).description, event.description);
      const admin = await createUser("Event admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
      const cancelled = await fetch(a.url + `/api/admin/events/${event.id}`, {
        method: "PUT", headers: { origin, "content-type": "application/json", "x-crushclub-client": "web", authorization: "Bearer " + admin.token },
        body: JSON.stringify({ status: "CANCELLED", cancellationReason: "Cancelled in isolated test" })
      });
      assert.equal(cancelled.status, 200);
      assert.equal((await request(b, "/public/events").then((response) => response.json())).events.some((item) => item.id === event.id), false);
      assert.equal((await request(b, "/events", alice).then((response) => response.json())).events.some((item) => item.id === event.id), false);
      assert.equal((await request(b, `/public/events/${event.id}`)).status, 404);
      assert.equal((await request(b, `/public/rooms/${event.room.id}`)).status, 404);
      assert.equal((await request(b, `/rooms/${event.room.id}/join`, alice, {})).status, 403);
    });

    await t.test("HTTP login budgets stay shared when traffic changes replicas and IPs", async () => {
      const email = "unknown-" + prefix + "@example.test";
      for (let index = 0; index < 15; index++) assert.equal((await request(index % 2 ? a : b, "/auth/login", null,
        { email, password: "wrong-password" })).status, 401);
      assert.equal((await request(b, "/auth/login", null, { email, password: "wrong-password" })).status, 429);
    });

    await t.test("losing the Redis bridge reconnects local clients and recovers persisted messages", async () => {
      const disconnected = once(sender, "disconnect");
      const id = randomUUID(); const lost = ipc(a.child, (message) => message.id === id);
      a.child.send({ action: "disconnect-redis", id });
      await lost; await disconnected;
      assert.equal((await request(a, "/health/ready")).status, 503);
      assert.equal(receiver.connected, true);
      assert.equal((await acknowledgement(receiver, "direct-message:send", { matchId: match.id, body: "While bridge was unavailable" })).ok, true);
      const connected = once(sender, "connect");
      const recoveredId = randomUUID(); const recovery = ipc(a.child, (message) => message.id === recoveredId);
      a.child.send({ action: "reconnect-redis", id: recoveredId });
      await recovery; await connected;
      assert.equal((await acknowledgement(sender, "match:join", { matchId: match.id })).ok, true);
      const history = await (await request(a, "/conversations/" + match.id + "/messages?limit=100", alice)).json();
      assert.ok(history.messages.some((message) => message.body === "While bridge was unavailable"));
      await eventually(async () => (await request(a, "/health/ready")).status === 200, "Redis readiness recovery");
    });

    await t.test("two schedulers create just one maintenance job of each type per database time slot", async () => {
      const scheduled = children.map((child) => {
        const id = randomUUID(); const done = ipc(child, (message) => message.id === id);
        child.send({ action: "schedule", id }); return done;
      });
      const scheduleResults = await Promise.all(scheduled);
      assert.ok(scheduleResults.every((message) => message.event === "scheduled"), JSON.stringify(scheduleResults));
      const rows = await prisma.$queryRaw`SELECT key FROM "BackgroundJob" WHERE type IN ('RESERVATION_CLEANUP', 'PAYMENT_SCAN')
        AND key IN ('reservation-cleanup:' || floor(extract(epoch FROM now()) / 300)::bigint,
                    'payment-scan:' || floor(extract(epoch FROM now()) / 300)::bigint)`;
      assert.equal(rows.length, 2);
      assert.equal(new Set(rows.map((row) => row.key)).size, 2);
    });

    await t.test("two buyers on separate APIs cannot buy the same last ticket; repeated payment confirmation settles once", async () => {
      const event = await prisma.event.create({ data: { title: "Final ticket", slug: "final-" + prefix, category: "Community",
        venue: "Test venue", city: "Lagos", startsAt: new Date(Date.now() + 86_400_000), status: "PUBLISHED",
        ticketTypes: { create: { name: "Regular", priceKobo: 2500, capacity: 1 } } }, include: { ticketTypes: true } });
      events.push(event.id);
      const results = await Promise.all([
        request(a, "/payments/events/" + event.id + "/ticket/initialize", alice, { quantity: 1 }),
        request(b, "/payments/events/" + event.id + "/ticket/initialize", bob, { quantity: 1 }),
      ]);
      assert.equal(results.filter((response) => response.status === 201).length, 1);
      const winnerIndex = results.findIndex((response) => response.status === 201);
      const initialized = await results[winnerIndex].json();
      const winner = winnerIndex === 0 ? alice : bob;
      assert.equal(await prisma.ticket.count({ where: { eventId: event.id, status: "RESERVED" } }), 1);
      const verified = await Promise.all([a, b].map((replica) => request(replica, "/payments/events/ticket/verify", winner,
        { reference: initialized.reference })));
      assert.ok(verified.every((response) => response.status === 201));
      const verificationBodies = await Promise.all(verified.map((response) => response.json()));
      assert.ok(verificationBodies.every((body) => body.status === "SUCCESS"));
      assert.equal(await prisma.ticket.count({ where: { eventId: event.id, status: "PAID" } }), 1);
      assert.equal((await prisma.ticketType.findUniqueOrThrow({ where: { id: event.ticketTypes[0].id } })).soldCount, 1);
      const jobs = await prisma.backgroundJob.findMany({ where: { type: "TICKET_EMAIL" } });
      const tickets = await prisma.ticket.findMany({ where: { eventId: event.id }, select: { id: true } });
      assert.equal(jobs.filter((job) => job.payload.ticketIds?.includes(tickets[0].id)).length, 1);
    });

    await t.test("staff scanners on separate APIs share one admission and enforce current event permissions", async () => {
      const admin = await createUser("gate-admin"), staff = await createUser("gate-staff"), staffTwo = await createUser("gate-staff-two");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
      await prisma.user.updateMany({ where: { id: { in: [staff.id, staffTwo.id] } }, data: { subscriptionStatus: "INACTIVE" } });
      const event = await prisma.event.create({ data: { title: "Staff gate", slug: "staff-" + prefix, category: "Community",
        venue: "Test gate", city: "Lagos", startsAt: new Date(Date.now() + 3600000), status: "PUBLISHED",
        ticketTypes: { create: { name: "Regular", priceKobo: 0, capacity: 2 } } }, include: { ticketTypes: true } });
      events.push(event.id);
      const endpoint = "/admissions/events/" + event.id + "/check-in";
      const code = "CCLTIX-" + randomUUID().replaceAll("-", "").toUpperCase();
      const ticket = await prisma.ticket.create({ data: { code, eventId: event.id, userId: alice.id,
        ticketTypeId: event.ticketTypes[0].id, status: "CONFIRMED" } });
      assert.equal((await request(a, endpoint, null, { code })).status, 401);
      assert.equal((await request(a, endpoint, bob, { code })).status, 403);
      const staffEndpoint = "/admin/events/" + event.id + "/check-in-staff";
      for (const person of [staff, staffTwo]) {
        assert.equal((await request(a, staffEndpoint, admin, { email: person.email })).status, 201);
      }
      assert.ok((await (await request(b, "/admissions/events", staff)).json()).events.some((row) => row.id === event.id));
      const spoofedRole = { ...staff, token: new JwtService().sign({ sub: staff.id, email: staff.email, role: "ADMIN" }, { secret: accessSecret, expiresIn: "15m" }) };
      assert.equal((await request(b, staffEndpoint, spoofedRole, { email: bob.email })).status, 403);
      assert.equal((await request(b, "/admin/users", staff)).status, 403);
      const responses = await Promise.all([request(a, endpoint, staff, { code }), request(b, endpoint, staffTwo, { code })]);
      assert.ok(responses.every((response) => response.status === 201));
      const outcomes = await Promise.all(responses.map((response) => response.json()));
      assert.deepEqual(outcomes.map((response) => response.alreadyCheckedIn).sort(), [false, true]);
      assert.equal(outcomes[0].ticket.checkedInBy.id, outcomes[1].ticket.checkedInBy.id);
      assert.equal(outcomes[0].ticket.holder.email, undefined);
      const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.ok([staff.id, staffTwo.id].includes(stored.checkedInById));
      const revoked = await fetch(a.url + "/api" + staffEndpoint + "/" + staff.id, {
        method: "DELETE", headers: { authorization: "Bearer " + admin.token }, signal: AbortSignal.timeout(15000),
      });
      assert.equal(revoked.status, 200);
      assert.equal((await request(b, endpoint, staff, { code })).status, 403);
    });

    await t.test("SIGTERM drains HTTP and socket writes, rejects new work, and reconnects to the surviving API", async () => {
      const httpBody = "held-" + prefix + "-http", socketBody = "held-" + prefix + "-socket";
      const httpHeld = ipc(a.child, (message) => message.id === httpBody);
      const pendingHttp = request(a, "/conversations/" + match.id + "/messages", alice, { body: httpBody });
      await httpHeld;
      const socketHeld = ipc(a.child, (message) => message.id === socketBody);
      const pendingSocket = acknowledgement(sender, "direct-message:send", { matchId: match.id, body: socketBody });
      await socketHeld;
      const exited = once(a.child, "exit");
      target = b.url;
      let recovered = false;
      sender.once("connect", async () => {
        const joined = await acknowledgement(sender, "match:join", { matchId: match.id });
        if (joined.ok) {
          const response = await request(b, "/conversations/" + match.id + "/messages?limit=100", alice);
          const history = await response.json();
          recovered = history.messages.some((message) => message.body === socketBody);
        }
      });
      a.child.kill("SIGTERM");
      await eventually(async () => (await request(a, "/health/ready")).status === 503, "readiness fails during drain");
      assert.equal((await request(a, "/health/live")).status, 200);
      assert.equal((await request(a, "/conversations", alice)).status, 503);
      const blocked = await acknowledgement(sender, "match:join", { matchId: match.id });
      assert.equal(blocked.retryable, true);
      a.child.send({ action: "release", id: httpBody });
      assert.equal((await pendingHttp).status, 201);
      assert.equal(a.child.exitCode, null, "Socket write is still active");
      a.child.send({ action: "release", id: socketBody });
      assert.equal((await pendingSocket).ok, true);
      assert.equal((await exited)[0], 0, a.diagnostics());
      await eventually(() => recovered, "rejoin and history recovery on instance B");
      assert.equal(receiver.connected, true, "Stopping A must not disconnect clients on B");
      const incoming = once(receiver, "direct-message:new");
      assert.equal((await acknowledgement(sender, "direct-message:send", { matchId: match.id, body: "After rolling replacement" })).ok, true);
      assert.equal((await incoming)[0].body, "After rolling replacement");
      assert.equal(await prisma.directMessage.count({ where: { matchId: match.id, body: { in: [httpBody, socketBody] } } }), 2);
    });

    await t.test("cleanup is bounded even when the Redis subscriber is already disconnected", async () => {
      const replacement = await startReplica();
      const id = randomUUID(); const disconnected = ipc(replacement.child, (message) => message.id === id);
      replacement.child.send({ action: "disconnect-redis", subscriber: true, id });
      await disconnected;
      const exited = once(replacement.child, "exit");
      const started = Date.now(); replacement.child.kill("SIGTERM");
      assert.equal((await exited)[0], 0, replacement.diagnostics());
      assert.ok(Date.now() - started < 3000);
    });

    await t.test("a stuck request has a bounded shutdown deadline and its open transaction rolls back", async () => {
      const body = "held-" + prefix + "-transaction";
      const held = ipc(b.child, (message) => message.id === body);
      // Handle the expected connection closure immediately; never retry a write.
      const pending = request(b, "/conversations/" + match.id + "/messages", alice, { body }).catch(() => null);
      await held;
      const exited = once(b.child, "exit");
      const started = Date.now();
      b.child.kill("SIGTERM");
      assert.equal((await exited)[0], 1);
      assert.ok(Date.now() - started < 13_000, "Shutdown must respect its deadline");
      await pending;
      assert.equal(await prisma.directMessage.count({ where: { matchId: match.id, body } }), 0);
    });
  } finally {
    for (const socket of clients) socket.disconnect();
    if (proxy) await proxy.close();
    await Promise.all(children.filter((child) => child.exitCode === null && child.signalCode === null).map(async (child) => {
      const exited = once(child, "exit"); child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 12_000);
      await exited; clearTimeout(force);
    }));
    const ticketIds = new Set((await prisma.ticket.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map((ticket) => ticket.id));
    const jobs = await prisma.backgroundJob.findMany({ where: { type: "TICKET_EMAIL" }, select: { id: true, payload: true } });
    await prisma.backgroundJob.deleteMany({ where: { id: { in: jobs.filter((job) => job.payload.ticketIds?.some((id) => ticketIds.has(id))).map((job) => job.id) } } });
    await prisma.event.deleteMany({ where: { id: { in: events } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
});
