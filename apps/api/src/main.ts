import "./observability/instrument";
import { createApiApplication } from "./api-application";
import { installApiShutdown } from "./lifecycle/api-shutdown";

async function bootstrap() {
  const { app, config, adapter } = await createApiApplication();
  installApiShutdown(app, adapter, Number(config.get<string>("API_SHUTDOWN_TIMEOUT_MS") ?? "30000"));
  await app.listen(Number(config.get<string>("PORT") ?? "4000"), "0.0.0.0");
}

void bootstrap();
