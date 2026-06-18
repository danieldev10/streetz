import { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io/adapters/io-adapter";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { ServerOptions } from "socket.io";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService
  ) {
    super(app);
  }

  async connectToRedis() {
    const redisUrl = this.config.getOrThrow<string>("REDIS_URL");
    const pubClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const webAppUrl = this.config.getOrThrow<string>("WEB_APP_URL");
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: [webAppUrl],
        credentials: true
      }
    });

    server.adapter(this.adapterConstructor);

    return server;
  }
}
