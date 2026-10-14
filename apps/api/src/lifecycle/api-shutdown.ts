import type { INestApplication } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import type { Server } from "node:http";
import { setImmediate as nextTurn } from "node:timers/promises";
import * as Sentry from "@sentry/nestjs";
import { ApiLifecycleService } from "./api-lifecycle.service";
import type { RedisIoAdapter } from "../realtime/redis-io.adapter";

/** Drain handlers before Nest invokes database/Redis module-destroy hooks. */
export function installApiShutdown(app: INestApplication, adapter: RedisIoAdapter, timeoutMs = 30_000) {
  const lifecycle = app.get(ApiLifecycleService);
  const logger = new Logger("ApiShutdown");
  let stopping: Promise<void> | undefined;
  const shutdown = () => {
    if (stopping) return stopping;
    lifecycle.beginDrain();
    logger.log({ event: "api_draining", instanceId: lifecycle.instanceId, activeWork: lifecycle.activeWork });
    stopping = (async () => {
      const deadline = setTimeout(() => {
        logger.error({ event: "api_shutdown_deadline", instanceId: lifecycle.instanceId, activeWork: lifecycle.activeWork });
        adapter.closeLocalConnections();
        (app.getHttpServer() as Server).closeAllConnections();
        process.exit(1);
      }, timeoutMs);
      deadline.unref();
      try {
        const idle = await lifecycle.waitForIdle(Math.max(1, timeoutMs - 3_000));
        if (!idle) {
          // Do not dispose dependencies underneath unfinished mutations. The
          // deadline will terminate the process and PostgreSQL rolls back them.
          logger.error({ event: "api_drain_timeout", instanceId: lifecycle.instanceId, activeWork: lifecycle.activeWork });
          await new Promise(() => {});
        }
        // Let completed Socket.IO handlers write their acknowledgements.
        await nextTurn();
        await adapter.closeLocalServers();
        await app.close();
        await Sentry.flush(2_000);
        logger.log({ event: "api_shutdown_complete", instanceId: lifecycle.instanceId });
        clearTimeout(deadline);
      } catch {
        logger.error({ event: "api_shutdown_failed", instanceId: lifecycle.instanceId });
        process.exitCode = 1;
        // Keep the deadline in place if cleanup failed.
      }
    })();
    return stopping;
  };
  const onSignal = () => { void shutdown(); };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  return { shutdown, removeSignalHandlers: () => {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
  } };
}
