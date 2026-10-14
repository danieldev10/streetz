// Full production application wiring, with only fixture providers held/mocked.
require("reflect-metadata");
const { createApiApplication } = require("../../dist/src/api-application.js");
const { installApiShutdown } = require("../../dist/src/lifecycle/api-shutdown.js");
const { ApiLifecycleService } = require("../../dist/src/lifecycle/api-lifecycle.service.js");
const { PrismaService } = require("../../dist/src/prisma/prisma.service.js");
const { MessagesService } = require("../../dist/src/messages/messages.service.js");
const { JobQueueService } = require("../../dist/src/jobs/job-queue.service.js");
const { RedisConnectionsService } = require("../../dist/src/realtime/redis-connections.service.js");
const { once } = require("node:events");
let prisma;
global.fetch = async (input, options = {}) => {
  // Never contact Paystack (or any other external provider) from this fixture.
  const url = String(input);
  if (url === "https://api.paystack.co/transaction/initialize") {
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: true, data: {
      reference: body.reference, authorization_url: "https://paystack.invalid/fixture", access_code: "fixture",
    } }), { headers: { "content-type": "application/json" } });
  }
  if (url.startsWith("https://api.paystack.co/transaction/verify/")) {
    const reference = decodeURIComponent(url.split("/").at(-1));
    const payment = await prisma.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    return new Response(JSON.stringify({ status: true, data: {
      status: "success", reference, amount: payment.amountKobo, currency: "NGN",
    } }), { headers: { "content-type": "application/json" } });
  }
  throw new Error("External calls are disabled in the replica fixture");
};

(async () => {
  if (process.env.NODE_ENV !== "test" || process.env.CI_TEST_DATABASE !== "true") throw new Error("Disposable test services required");
  const target = new URL(process.env.TEST_DATABASE_URL);
  if (target.hostname !== "127.0.0.1" || target.pathname !== "/crushclub_ci") throw new Error("Unsafe test target");
  const { app, adapter } = await createApiApplication();
  prisma = app.get(PrismaService);
  const marker = await prisma.$queryRaw`SELECT kind FROM ci_metadata.target`;
  if (marker[0]?.kind !== "crushclub-integration-tests") throw new Error("Unprepared test database");
  const lifecycle = app.get(ApiLifecycleService);
  const shutdown = installApiShutdown(app, adapter, Number(process.env.API_SHUTDOWN_TIMEOUT_MS));
  const holds = new Map();
  const messages = app.get(MessagesService);
  const createMessage = messages.createMessage.bind(messages);
  messages.createMessage = async (...args) => {
    const body = args[2];
    if (typeof body === "string" && body.startsWith("held-" + process.env.REPLICA_TEST_PREFIX)) {
      const held = new Promise((resolve) => holds.set(body, resolve));
      if (body.endsWith("-transaction")) {
        return prisma.$transaction(async (transaction) => {
          const message = await transaction.directMessage.create({ data: { senderId: args[0], matchId: args[1], body } });
          process.send({ event: "held", id: body });
          await held;
          return message;
        }, { timeout: 20_000 });
      }
      process.send({ event: "held", id: body });
      await held;
    }
    return createMessage(...args);
  };
  process.on("message", async (message) => {
    if (message.action === "release") holds.get(message.id)?.();
    if (message.action === "schedule") {
      try {
        await app.get(JobQueueService).schedule();
        process.send({ event: "scheduled", id: message.id });
      } catch (error) { process.send({ event: "schedule-failed", id: message.id, error: error.message }); }
    }
    if (message.action === "disconnect-redis") {
      const client = app.get(RedisConnectionsService)[message.subscriber ? "subscriber" : "publisher"];
      const ended = once(client, "end"); client.disconnect(); await ended;
      process.send({ event: "redis-disconnected", id: message.id });
    }
    if (message.action === "reconnect-redis") {
      await app.get(RedisConnectionsService).publisher.connect();
      process.send({ event: "redis-reconnected", id: message.id });
    }
  });
  const stopped = () => {
    void shutdown.shutdown().then(() => {
      shutdown.removeSignalHandlers();
      process.disconnect();
    });
  };
  process.once("SIGTERM", stopped);
  process.once("SIGINT", stopped);
  await app.listen(0, "127.0.0.1");
  process.send({ event: "ready", url: await app.getUrl(), instanceId: lifecycle.instanceId });
})().catch(() => { process.stderr.write("Replica fixture failed to start\n"); process.exit(1); });
