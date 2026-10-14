import { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io/adapters/io-adapter";
import { createAdapter } from "@socket.io/redis-adapter";
import { ServerOptions } from "socket.io";
import { Server, Socket } from "socket.io";
import { isObservable, lastValueFrom } from "rxjs";
import { RedisConnectionsService } from "./redis-connections.service";
import { browserOrigins } from "../auth/browser-origins";
import { ApiLifecycleService } from "../lifecycle/api-lifecycle.service";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly servers = new Set<Server>();
  private readonly closing = new Map<Server, Promise<void>>();
  private readonly clients = new Set<Socket["conn"]>();

  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService,
    private readonly connections: RedisConnectionsService,
    private readonly lifecycle: ApiLifecycleService
  ) {
    super(app);
  }

  async connectToRedis() {
    await this.connections.connect();
    // The upstream adapter does not await/catch ioredis unsubscribe promises
    // during close. An already lost connection must not cause an unhandled
    // rejection after an otherwise successful shutdown.
    const subscriber = new Proxy(this.connections.subscriber, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (property === "punsubscribe" || property === "unsubscribe") {
          const unsubscribe = value as (...args: unknown[]) => Promise<unknown>;
          return (...args: unknown[]) => target.status === "ready"
            ? unsubscribe.apply(target, args).catch(() => 0)
            : Promise.resolve(0);
        }
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    this.adapterConstructor = createAdapter(this.connections.publisher, subscriber);
    this.connections.onUnavailable(() => {
      // Force a reconnect/history fetch after bridge loss. Close client
      // transports only; closing Engine.IO itself would prevent recovery.
      for (const client of this.clients) client.close(true);
    });
  }

  createIOServer(port: number, options?: ServerOptions) {
    const webAppUrl = this.config.getOrThrow<string>("WEB_APP_URL");
    const origins = browserOrigins(webAppUrl, this.config.get<string>("AUTH_ALLOWED_ORIGINS"));
    const allowRequest: NonNullable<ServerOptions["allowRequest"]> = (request, callback) =>
      callback(null, !this.lifecycle.isDraining() && this.connections.isConnected() &&
        (request.headers.origin === undefined || origins.includes(request.headers.origin)));
    const server: Server = super.createIOServer(port, {
      ...options,
      // Railway replicas have no polling affinity. One WebSocket connection
      // stays on its accepting replica; Redis forwards room broadcasts.
      transports: ["websocket"],
      cors: {
        origin: origins,
        credentials: true
      },
      // CORS doesn't protect the WebSocket upgrade itself. Native clients may
      // omit Origin; authenticated namespaces still require a bearer token.
      allowRequest
    });

    server.adapter(this.adapterConstructor);
    server.engine.on("connection", (client: Socket["conn"]) => {
      if (this.lifecycle.isDraining() || !this.connections.isConnected()) { client.close(true); return; }
      this.clients.add(client);
      client.once("close", () => this.clients.delete(client));
    });
    this.servers.add(server);

    return server;
  }

  override bindMessageHandlers(...[socket, handlers, transform]: Parameters<IoAdapter["bindMessageHandlers"]>) {
    super.bindMessageHandlers(socket, handlers.map((handler) => ({
      ...handler,
      callback: (...args: unknown[]) => {
        if (this.lifecycle.isDraining() || !this.connections.isConnected()) {
          return Promise.resolve({ ok: false, retryable: true, error: "Reconnecting. Please try again shortly." });
        }
        return this.lifecycle.track(async () => {
          const result: unknown = await handler.callback(...args);
          return isObservable(result) ? lastValueFrom(result, { defaultValue: undefined }) : result;
        });
      }
    })), transform);
  }

  closeLocalConnections() {
    // Engine close triggers automatic client reconnection. Using the Redis
    // adapter's disconnectSockets() would also disconnect other replicas.
    for (const server of this.servers) server.engine?.close();
  }

  async closeLocalServers() {
    await Promise.all([...this.servers].map((server) => this.close(server)));
  }

  override async close(server: Parameters<IoAdapter["close"]>[0]) {
    if (!this.servers.has(server)) return super.close(server);
    // Unsubscribe while Redis is still connected. Nest closes adapters again
    // after module-destroy hooks, so never close the same server twice.
    if (!this.closing.has(server)) this.closing.set(server, server.close());
    await this.closing.get(server);
  }
}
