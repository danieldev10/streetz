import type { ConfigService } from "@nestjs/config";

const DEFAULTS = {
  maxConnections: 10,
  connectionTimeoutMs: 5_000,
  idleTimeoutMs: 30_000,
  maxLifetimeSeconds: 1_800,
  statementTimeoutMs: 15_000
} as const;

function readInteger(
  config: Pick<ConfigService, "get">,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const rawValue = config.get<string | number>(key);

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const value = typeof rawValue === "number" ? rawValue : Number(rawValue);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }

  return value;
}

export function getDatabasePoolSettings(config: Pick<ConfigService, "get">) {
  return {
    maxConnections: readInteger(config, "DB_POOL_MAX", DEFAULTS.maxConnections, 1, 50),
    connectionTimeoutMs: readInteger(
      config,
      "DB_POOL_CONNECTION_TIMEOUT_MS",
      DEFAULTS.connectionTimeoutMs,
      100,
      60_000
    ),
    idleTimeoutMs: readInteger(
      config,
      "DB_POOL_IDLE_TIMEOUT_MS",
      DEFAULTS.idleTimeoutMs,
      1_000,
      600_000
    ),
    maxLifetimeSeconds: readInteger(
      config,
      "DB_POOL_MAX_LIFETIME_SECONDS",
      DEFAULTS.maxLifetimeSeconds,
      60,
      86_400
    ),
    statementTimeoutMs: readInteger(
      config,
      "DB_STATEMENT_TIMEOUT_MS",
      DEFAULTS.statementTimeoutMs,
      1_000,
      120_000
    )
  };
}

export type DatabasePoolSettings = ReturnType<typeof getDatabasePoolSettings>;
