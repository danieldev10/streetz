const assert = require("node:assert/strict");
const { test } = require("node:test");
const { once } = require("node:events");
const { fork } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { PrismaClient, BackgroundJobType } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { JobQueueService } = require("../dist/src/jobs/job-queue.service.js");
const { JobPayloadService } = require("../dist/src/jobs/job-payload.service.js");
const { BackgroundWorkerService } = require("../dist/src/jobs/background-worker.service.js");
const { JobHandlerService } = require("../dist/src/jobs/job-handler.service.js");
const { MailQueueService } = require("../dist/src/mail/mail-queue.service.js");
const { enqueueJob } = require("../dist/src/jobs/enqueue-job.js");
const connectionString = process.env.TEST_DATABASE_URL;
const config = { get: () => undefined, getOrThrow: () => "test-job-encryption-secret" };
const payloads = new JobPayloadService(config);

test("private job payloads are encrypted and bound to their job key", () => {
  const input = { resetUrl: "https://example.invalid/reset?token=private", to: "private@example.invalid" };
  const encoded = payloads.encrypt(input, "reset:one");
  assert.ok(!encoded.includes("private"));
  assert.deepEqual(payloads.decrypt(encoded, "reset:one"), input);
  assert.notEqual(payloads.encrypt(input, "reset:one"), encoded);
  assert.throws(() => payloads.decrypt(encoded, "reset:two"), { code: "JOB_PAYLOAD_UNREADABLE" });
  const pieces = encoded.split(".");
  pieces[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => payloads.decrypt(pieces.join("."), "reset:one"), { code: "JOB_PAYLOAD_UNREADABLE" });
  const anotherKey = new JobPayloadService({ get: () => undefined, getOrThrow: () => "different-test-key" });
  assert.throws(() => anotherKey.decrypt(encoded, "reset:one"), { code: "JOB_PAYLOAD_UNREADABLE" });
});

test("durable queue ownership, retries, and recovery", { skip: !connectionString }, async (t) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const other = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const queue = new JobQueueService(prisma), competing = new JobQueueService(other);
  const prefix = `job-test:${randomUUID()}:`;
  const types = [BackgroundJobType.SUPPORT_REPLY_EMAIL];
  const create = (label, extra = {}) => enqueueJob(prisma, { key: `${prefix}${label}`, type: types[0], payload: {}, ...extra });
  const cleanup = () => prisma.backgroundJob.deleteMany({ where: { key: { startsWith: prefix } } });
  try {
    await t.test("competing database clients claim a job once and completion clears secrets", async () => {
      const original = await create("race", { encryptedPayload: payloads.encrypt({ token: "private" }, "context") });
      const results = await Promise.all([queue.claim(120000, types), competing.claim(120000, types)]);
      assert.equal(results.filter(Boolean).length, 1);
      const owned = results.find(Boolean);
      assert.equal(owned.id, original.id);
      assert.equal(owned.attempts, 1);
      assert.equal(await queue.complete(owned), true);
      assert.equal(await competing.complete(owned), false);
      assert.equal(await queue.claim(120000, types), null);
      assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: original.id } })).encryptedPayload, null);
      await cleanup();
    });
    await t.test("lease timing and retries stay correct in a non-UTC database session", async () => {
      const zoned = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1, options: "-c TimeZone=Pacific/Honolulu" }) });
      const zonedQueue = new JobQueueService(zoned);
      try {
        assert.equal((await zoned.$queryRaw`SELECT current_setting('TimeZone') AS zone`)[0].zone, "Pacific/Honolulu");
        const row = await create("time-zone");
        const owned = await zonedQueue.claim(120000, types);
        assert.equal(owned.id, row.id);
        assert.ok(owned.lockedUntil.getTime() > Date.now() + 115000);
        assert.ok(owned.lockedUntil.getTime() < Date.now() + 125000);
        assert.equal(await zonedQueue.renew(owned, 120000), true);
        await zonedQueue.fail(owned, "TEST_PERMANENT", true);
        await zonedQueue.retry(row.id);
        const retried = await queue.claim(120000, types);
        assert.equal(retried.id, row.id);
        await queue.complete(retried);
      } finally { await zoned.$disconnect(); await cleanup(); }
    });
    await t.test("a killed process loses its lease and stale owners cannot acknowledge or reschedule", async () => {
      const original = await create("crash");
      const child = fork(path.join(__dirname, "fixtures/claim-job.cjs"), [], {
        env: { ...process.env, TEST_DATABASE_URL: connectionString }, stdio: ["ignore", "ignore", "pipe", "ipc"]
      });
      t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
      const claimed = await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw new Error("Claim process exited early"); })]);
      assert.equal(claimed[0].id, original.id);
      const stale = claimed[0];
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
      await prisma.backgroundJob.update({ where: { id: original.id }, data: { lockedUntil: new Date(0) } });
      const recovered = await competing.claim(120000, types);
      assert.equal(recovered.id, original.id);
      assert.equal(recovered.attempts, 2);
      assert.notEqual(recovered.leaseToken, stale.leaseToken);
      assert.equal(await queue.renew(stale, 120000), false);
      assert.equal(await queue.complete(stale), false);
      assert.equal((await queue.fail(stale, "STALE")).changed, false);
      await competing.complete(recovered);
      await cleanup();
    });
    await t.test("SMTP failures back off, exhaust their budget, and require explicit retry", async () => {
      const original = await create("retry", { maxAttempts: 2 });
      const first = await queue.claim(120000, types);
      assert.deepEqual(await queue.fail(first, "SMTP_TEMPORARY"), { changed: true, exhausted: false });
      assert.equal(await queue.claim(120000, types), null);
      let row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: original.id } });
      assert.ok(row.runAt.getTime() > Date.now() + 25000);
      await prisma.backgroundJob.update({ where: { id: original.id }, data: { runAt: new Date(0) } });
      const last = await queue.claim(120000, types);
      assert.deepEqual(await queue.fail(last, "SMTP_TEMPORARY"), { changed: true, exhausted: true });
      assert.equal(await queue.claim(120000, types), null);
      row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: original.id } });
      assert.equal(row.state, "FAILED");
      assert.equal(row.lastError, "SMTP_TEMPORARY");
      await queue.retry(original.id);
      assert.equal((await queue.claim(120000, types)).attempts, 1);
      await cleanup();
    });
    await t.test("expired jobs are never sent and their private values are cleared", async () => {
      const row = await create("expired", { expiresAt: new Date(0), encryptedPayload: "private-ciphertext" });
      assert.equal(await queue.claim(120000, types), null);
      await queue.recover();
      const stored = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(stored.lastError, "EXPIRED");
      assert.equal(stored.encryptedPayload, null);
      await assert.rejects(queue.retry(row.id), /Only failed, unexpired/);
      await cleanup();
    });
    await t.test("crashing on the last attempt becomes a visible failed job", async () => {
      const row = await create("last-crash", { maxAttempts: 1 });
      await queue.claim(120000, types);
      await prisma.backgroundJob.update({ where: { id: row.id }, data: { lockedUntil: new Date(0) } });
      await queue.recover();
      assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: row.id } })).lastError, "LEASE_RETRIES_EXHAUSTED");
      const info = await queue.inspect("FAILED");
      const visible = info.jobs.find((item) => item.id === row.id);
      assert.ok(visible);
      for (const key of ["payload", "encryptedPayload", "leaseToken", "key"]) assert.ok(!(key in visible));
      await cleanup();
    });
    await t.test("database rollback cannot leave an orphan email job", async () => {
      await assert.rejects(prisma.$transaction(async (tx) => {
        await enqueueJob(tx, { key: `${prefix}rollback`, type: types[0], payload: {} });
        throw new Error("Business transaction failed");
      }), /Business transaction failed/);
      assert.equal(await prisma.backgroundJob.count({ where: { key: `${prefix}rollback` } }), 0);
    });
    await t.test("lost ownership prevents the worker from starting an external side effect", async () => {
      const row = await create("lost-side-effect");
      const owned = await queue.claim(120000, types);
      let sent = 0;
      const handler = { handle: async (_job, beforeSideEffect) => {
        await prisma.backgroundJob.update({ where: { id: row.id }, data: { lockedUntil: new Date(0) } });
        await beforeSideEffect(); sent++;
      } };
      const worker = new BackgroundWorkerService(prisma, queue, handler, config);
      await worker.process(owned);
      assert.equal(sent, 0);
      assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: row.id } })).state, "RUNNING");
      await cleanup();
    });
    await t.test("worker stop drains the in-flight job before database shutdown", async () => {
      const row = await create("drain");
      let enter, release;
      const started = new Promise((resolve) => { enter = resolve; });
      const held = new Promise((resolve) => { release = resolve; });
      const routing = { recover: async () => {}, schedule: async () => {},
        claim: (lease) => queue.claim(lease, types), renew: (...args) => queue.renew(...args),
        complete: (...args) => queue.complete(...args), fail: (...args) => queue.fail(...args) };
      const handler = { handle: async () => { enter(); await held; } };
      const worker = new BackgroundWorkerService(prisma, routing, handler, { get: (key) => key === "WORKER_CONCURRENCY" ? "1" : undefined });
      worker.onModuleInit(); await started;
      let stopped = false;
      const draining = worker.stop().then(() => { stopped = true; });
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(stopped, false);
      release(); await draining;
      assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: row.id } })).state, "SUCCEEDED");
      assert.equal(worker.ready(), false);
      await cleanup();
    });
    await t.test("legacy API ticket jobs are imported once and completed legacy deliveries are skipped", async () => {
      const legacy = await prisma.ticketEmailDelivery.create({ data: { key: `${prefix}legacy`, ticketIds: ["test-ticket"] } });
      try {
        await queue.recover(); await queue.recover();
        const migrated = await prisma.backgroundJob.findUniqueOrThrow({ where: { key: `ticket-email:${legacy.key}` } });
        assert.equal(migrated.payload.legacyDeliveryId, legacy.id);
        await prisma.ticketEmailDelivery.update({ where: { id: legacy.id }, data: { sentAt: new Date() } });
        const handler = new JobHandlerService(prisma, {}, {}, { deliver: () => { throw new Error("Must not resend legacy delivery"); } }, queue, payloads);
        await handler.handle(migrated);
      } finally {
        await prisma.ticketEmailDelivery.delete({ where: { id: legacy.id } });
        await prisma.backgroundJob.deleteMany({ where: { key: `ticket-email:${legacy.key}` } });
      }
    });
    await t.test("a failed acknowledgement cannot abandon another in-flight job during shutdown", async () => {
      const failing = await create("ack-failure");
      const working = await create("held-peer");
      let release, entered, failed;
      const held = new Promise((resolve) => { release = resolve; });
      const started = new Promise((resolve) => { entered = resolve; });
      const ackFailed = new Promise((resolve) => { failed = resolve; });
      const routing = { recover: async () => [], schedule: async () => {},
        claim: (lease) => queue.claim(lease, types), renew: (...args) => queue.renew(...args),
        complete: (...args) => queue.complete(...args), fail: async () => { failed(); throw new Error("acknowledgement unavailable"); } };
      const handler = { handle: async (job) => {
        if (job.id === failing.id) throw new Error("failed handler");
        entered(); await held;
      } };
      const worker = new BackgroundWorkerService(prisma, routing, handler, { get: (key) => key === "WORKER_CONCURRENCY" ? "2" : undefined });
      worker.onModuleInit(); await Promise.all([started, ackFailed]);
      let stopped = false;
      const draining = worker.stop().then(() => { stopped = true; });
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(stopped, false);
      release(); await draining;
      assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: working.id } })).state, "SUCCEEDED");
      assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: failing.id } })).state, "RUNNING");
      await cleanup();
    });
  } finally { await cleanup(); await Promise.all([prisma.$disconnect(), other.$disconnect()]); }
});

test("password reset queues the token and email atomically without calling SMTP", { skip: !connectionString }, async () => {
  const { AuthService } = require("../dist/src/auth/auth.service.js");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await prisma.user.create({ data: { email: `reset-${randomUUID()}@example.invalid`, displayName: "Reset test", passwordHash: "unused" } });
  const resetConfig = { get: (key) => key === "WEB_APP_URL" ? "https://example.invalid" : undefined, getOrThrow: () => "test-job-encryption-secret" };
  const service = new AuthService({ findByEmail: async () => user }, prisma, new MailQueueService(payloads), {}, resetConfig);
  try {
    const result = await service.requestPasswordReset({ email: user.email });
    const token = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { key: `password-reset:${token.id}` } });
    const input = payloads.decrypt(job.encryptedPayload, job.key);
    assert.equal(input.to, user.email);
    assert.ok(!JSON.stringify(job.payload).includes(user.email));
    assert.equal(service.hashPasswordResetToken(new URL(input.resetUrl).searchParams.get("token")), token.tokenHash);
    assert.equal(result.message.includes("If an account exists"), true);
    await prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    const handler = new JobHandlerService(prisma, {}, { sendPasswordResetEmail: () => { throw new Error("Must not send a consumed reset link"); } }, {}, {}, payloads);
    await handler.handle(job);
  } finally {
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id }, select: { id: true } });
    await prisma.backgroundJob.deleteMany({ where: { key: { in: tokens.map((row) => `password-reset:${row.id}`) } } });
    await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect();
  }
});

test("support confirmations and admin replies commit together with encrypted email jobs", { skip: !connectionString }, async () => {
  const { SupportService } = require("../dist/src/support/support.service.js");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const supportConfig = { get: () => undefined, getOrThrow: (key) => key === "WEB_APP_URL" ? "https://example.invalid" : "test-job-encryption-secret" };
  const mail = new MailQueueService(payloads);
  const support = new SupportService(prisma, supportConfig, mail);
  const admin = await prisma.user.create({ data: { email: `admin-${randomUUID()}@example.invalid`, displayName: "Admin", passwordHash: "unused", role: "ADMIN" } });
  let requestId;
  try {
    const unique = randomUUID();
    const input = { email: `guest-${unique}@example.invalid`, displayName: "Guest", category: "OTHER", subject: `Help ${unique}`, message: "Private message" };
    const failure = new SupportService(prisma, supportConfig, { queue: async () => { throw new Error("outbox failed"); } });
    await assert.rejects(failure.createGuestRequest(input), /outbox failed/);
    assert.equal(await prisma.supportRequest.count({ where: { email: input.email } }), 0);
    const result = await support.createGuestRequest(input);
    requestId = result.request.id;
    assert.equal(result.emailQueued, true);
    const received = await prisma.backgroundJob.findUniqueOrThrow({ where: { key: `support-received:${requestId}` } });
    const receivedEmail = payloads.decrypt(received.encryptedPayload, received.key);
    assert.ok(!JSON.stringify(received).includes(input.email));
    const url = new URL(receivedEmail.supportUrl);
    assert.equal((await support.getGuestRequest(requestId, url.searchParams.get("token"))).id, requestId);
    const updated = await support.replyAsAdmin(admin.id, requestId, { message: "Private reply" });
    const message = updated.messages.find((row) => row.authorType === "ADMIN");
    const reply = await prisma.backgroundJob.findUniqueOrThrow({ where: { key: `support-reply:${message.id}` } });
    assert.ok(!JSON.stringify(reply).includes("Private reply"));
    assert.equal(payloads.decrypt(reply.encryptedPayload, reply.key).message, "Private reply");
  } finally {
    if (requestId) {
      await prisma.backgroundJob.deleteMany({ where: { payload: { path: ["entityId"], equals: requestId } } });
      await prisma.supportRequest.delete({ where: { id: requestId } });
    }
    await prisma.user.delete({ where: { id: admin.id } }); await prisma.$disconnect();
  }
});
