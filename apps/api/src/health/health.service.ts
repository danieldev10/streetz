import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { RedisConnectionsService } from "../realtime/redis-connections.service";

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly database: Pool;
  private pending: Promise<boolean> | null = null;
  private lastResult: { ready: boolean; expiresAt: number } | null = null;

  constructor(config: ConfigService, private readonly redis: RedisConnectionsService) {
    // A small dedicated pool bounds both acquisition and query time, even when
    // the application pool is busy. Account for this one connection in DB budgets.
    this.database = new Pool({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      application_name: "crushclub-health",
      max: 1,
      connectionTimeoutMillis: 1_000,
      statement_timeout: 1_000,
      query_timeout: 1_000,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true
    });
    this.database.on("error", () => this.logger.warn({ event: "health_database_connection_error" }));
  }

  isReady(): Promise<boolean> {
    // Coalesce concurrent probes, including failed ones, so monitoring cannot
    // exhaust connections or leave queued work after an outage.
    if (this.lastResult && this.lastResult.expiresAt > Date.now()) return Promise.resolve(this.lastResult.ready);
    if (this.pending) return this.pending;
    this.pending = this.checkDependencies().then((ready) => {
      if (this.lastResult?.ready !== ready) {
        const event = { event: "readiness_changed", ready };
        if (ready) this.logger.log(event);
        else this.logger.warn(event);
      }
      this.lastResult = { ready, expiresAt: Date.now() + 250 };
      return ready;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  private async checkDependencies() {
    const results = await Promise.allSettled([
      this.database.query("SELECT 1").then(() => true),
      this.redis.checkHealth()
    ]);
    return results.every((result) => result.status === "fulfilled" && result.value === true);
  }

  async onModuleDestroy() {
    await this.pending;
    await this.database.end();
  }
}
