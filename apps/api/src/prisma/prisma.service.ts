import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import {
  DatabasePoolSettings,
  getDatabasePoolSettings
} from "./database-pool-settings";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  private readonly poolSettings: DatabasePoolSettings;
  private readonly logger: Logger;

  constructor(config: ConfigService) {
    const logger = new Logger(PrismaService.name);
    const poolSettings = getDatabasePoolSettings(config);
    const pool = new Pool({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      application_name: "streetz-api",
      max: poolSettings.maxConnections,
      connectionTimeoutMillis: poolSettings.connectionTimeoutMs,
      idleTimeoutMillis: poolSettings.idleTimeoutMs,
      maxLifetimeSeconds: poolSettings.maxLifetimeSeconds,
      statement_timeout: poolSettings.statementTimeoutMs,
      query_timeout: poolSettings.statementTimeoutMs + 1_000
    });
    const adapter = new PrismaPg(pool, {
      disposeExternalPool: true,
      onPoolError: (error) => logger.error(`PostgreSQL pool error: ${error.message}`, error.stack)
    });

    super({ adapter });

    this.pool = pool;
    this.poolSettings = poolSettings;
    this.logger = logger;
  }

  async onModuleInit() {
    await this.$connect();
    // Ensure PostGIS functions resolve from whichever schema the extension
    // is installed in (Supabase uses "extensions", Railway uses "public").
    await this.$executeRawUnsafe(
      `SET search_path TO public,extensions`
    );
    this.logger.log(
      `PostgreSQL pool ready (max=${this.poolSettings.maxConnections}, statementTimeoutMs=${this.poolSettings.statementTimeoutMs})`
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  getPoolMetrics() {
    const totalConnections = this.pool.totalCount;
    const idleConnections = this.pool.idleCount;
    const activeConnections = Math.max(0, totalConnections - idleConnections);

    return {
      maxConnections: this.poolSettings.maxConnections,
      totalConnections,
      activeConnections,
      idleConnections,
      waitingRequests: this.pool.waitingCount,
      utilizationPercent: Math.round((activeConnections / this.poolSettings.maxConnections) * 100),
      connectionTimeoutMs: this.poolSettings.connectionTimeoutMs,
      statementTimeoutMs: this.poolSettings.statementTimeoutMs
    };
  }
}
