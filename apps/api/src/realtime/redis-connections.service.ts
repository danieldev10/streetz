import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisConnectionsService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionsService.name);
  readonly publisher: Redis;
  readonly subscriber: Redis;
  private readonly probe: Redis;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>("REDIS_URL");
    this.publisher = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
    this.subscriber = this.publisher.duplicate();
    this.probe = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      retryStrategy: () => 1_000
    });
    // Listen without logging connection URLs or errors that may contain credentials.
    for (const client of [this.publisher, this.subscriber, this.probe]) {
      let reported = false;
      client.on("error", () => {
        if (!reported) this.logger.warn({ event: "redis_connection_error" });
        reported = true;
      });
      client.on("ready", () => { reported = false; });
    }
  }

  async connect() {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    void this.probe.connect().catch(() => undefined);
  }

  async checkHealth() {
    // A separate successful PING must not hide a disconnected Socket.IO client.
    if ([this.publisher, this.subscriber, this.probe].some((client) => client.status !== "ready")) {
      return false;
    }
    try {
      return await this.probe.ping() === "PONG";
    } catch {
      return false;
    }
  }

  onModuleDestroy() {
    for (const client of [this.publisher, this.subscriber, this.probe]) client.disconnect();
  }
}
