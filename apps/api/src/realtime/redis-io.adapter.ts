import { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io/adapters/io-adapter";
import { createAdapter } from "@socket.io/redis-adapter";
import { ServerOptions } from "socket.io";
import { RedisConnectionsService } from "./redis-connections.service";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService,
    private readonly connections: RedisConnectionsService
  ) {
    super(app);
  }

  async connectToRedis() {
    await this.connections.connect();
    this.adapterConstructor = createAdapter(this.connections.publisher, this.connections.subscriber);
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
