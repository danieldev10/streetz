import "./observability/instrument";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { WorkerModule } from "./jobs/worker.module";
import { BackgroundWorkerService } from "./jobs/background-worker.service";
import { StructuredLogger } from "./observability/structured-logger";
import * as Sentry from "@sentry/nestjs";

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule, {
    ...(process.env.NODE_ENV === "production"
      ? { logger: new StructuredLogger() }
      : {}),
  });
  const worker = app.get(BackgroundWorkerService);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 45_000);
    deadline.unref();
    try {
      await worker.stop();
      await app.close();
      await Sentry.flush(2_000);
    } catch {
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  await app.listen(
    Number(app.get(ConfigService).get<string>("PORT") ?? "4001"),
    "0.0.0.0",
  );
}

void bootstrap();
