import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerStorage } from "@nestjs/throttler";
import Redis from "ioredis";
import { createHmac } from "crypto";

// Atomic fixed windows and bounded blocks; all API replicas use Redis time/TTL.
const INCREMENT = `
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then return {tonumber(redis.call('GET', KEYS[1]) or ARGV[2]), blocked, 1, blocked} end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {hits, tonumber(ARGV[3]), 1, tonumber(ARGV[3])}
end
return {hits, redis.call('PTTL', KEYS[1]), 0, 0}
`;

@Injectable()
export class RedisRateLimitStore implements ThrottlerStorage, OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private reported = false;
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>("JWT_ACCESS_SECRET");
    this.redis = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
      connectTimeout: 1_000, commandTimeout: 1_000, retryStrategy: () => 1_000,
    });
    this.redis.on("error", () => this.report());
    this.redis.on("ready", () => { this.reported = false; });
  }
  onModuleInit() { void this.redis.connect().catch(() => this.report()); }
  onModuleDestroy() { this.redis.disconnect(); }
  isReady() { return this.redis.status === "ready"; }
  async checkHealth() {
    if (!this.isReady()) return false;
    try { return await this.redis.ping() === "PONG"; }
    catch { this.report(); return false; }
  }
  identifier(value: string) {
    return createHmac("sha256", this.secret).update(`crushclub-rate-limits-v1:${value}`).digest("hex");
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const id = this.identifier(`${throttlerName}:${key}`);
    const prefix = `crushclub:rate:v1:{${id}}`;
    try {
      if (!this.isReady()) throw new Error();
      const [totalHits, expires, blocked, blockExpires] = await this.redis.eval(
        INCREMENT, 2, prefix, `${prefix}:block`, ttl, limit, blockDuration,
      ) as number[];
      return { totalHits, timeToExpire: Math.ceil(Math.max(0, expires) / 1000),
        isBlocked: blocked === 1, timeToBlockExpire: Math.ceil(Math.max(0, blockExpires) / 1000) };
    } catch {
      this.report();
      // Never silently fall back to independent counters during a Redis outage.
      throw new ServiceUnavailableException("Request protection is temporarily unavailable. Please try again.");
    }
  }
  private report() {
    if (!this.reported) this.logger.error({ event: "rate_limit_store_unavailable" });
    this.reported = true;
  }
}
