import {
  Controller,
  Get,
  Header,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { BackgroundWorkerService } from "./background-worker.service";

@Controller("health")
export class WorkerHealthController implements OnModuleDestroy {
  private readonly database: Pool;
  private readonly logger = new Logger(WorkerHealthController.name);
  private pending: Promise<boolean> | undefined;
  constructor(
    config: ConfigService,
    private readonly worker: BackgroundWorkerService,
  ) {
    this.database = new Pool({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      application_name: "crushclub-worker-health",
      max: 1,
      connectionTimeoutMillis: 1000,
      statement_timeout: 1000,
      query_timeout: 1000,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
    this.database.on("error", () =>
      this.logger.warn({ event: "worker_health_database_error" }),
    );
  }

  @Get("live")
  @Header("Cache-Control", "no-store")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  async ready() {
    if (!this.worker.ready())
      throw new ServiceUnavailableException({ status: "unavailable" });
    this.pending ??= this.database
      .query("SELECT 1")
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        this.pending = undefined;
      });
    if (!(await this.pending))
      throw new ServiceUnavailableException({ status: "unavailable" });
    return { status: "ok" };
  }

  async onModuleDestroy() {
    await this.pending;
    await this.database.end();
  }
}
