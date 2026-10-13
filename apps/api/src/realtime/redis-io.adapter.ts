import { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io/adapters/io-adapter";
import { createAdapter } from "@socket.io/redis-adapter";
import { ServerOptions } from "socket.io";
import { RedisConnectionsService } from "./redis-connections.service";
import { browserOrigins } from "../auth/browser-origins";

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
    const origins = browserOrigins(webAppUrl, this.config.get<string>("AUTH_ALLOWED_ORIGINS"));
    const allowRequest: NonNullable<ServerOptions["allowRequest"]> = (request, callback) =>
      callback(null, request.headers.origin === undefined || origins.includes(request.headers.origin));
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: origins,
        credentials: true
      },
      // CORS doesn't protect the WebSocket upgrade itself. Native clients may
      // omit Origin; authenticated namespaces still require a bearer token.
      allowRequest
    });

    server.adapter(this.adapterConstructor);

    return server;
  }
}
