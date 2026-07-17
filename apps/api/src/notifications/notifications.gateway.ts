import { Logger } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthUser } from "../auth/types/auth-user";
import { RealtimeAuthService } from "../auth/realtime-auth.service";
import { getUserNotificationRoom } from "./notification-rooms";

type AuthenticatedSocket = Socket & {
  data: {
    user?: AuthUser;
  };
};

@WebSocketGateway()
export class NotificationsGateway implements OnGatewayConnection {
  private server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly realtimeAuth: RealtimeAuthService
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const user = await this.realtimeAuth.authenticate(client);
      client.data.user = user;
      await client.join(getUserNotificationRoom(user.id));
    } catch (error) {
      this.logger.warn(`Rejected notification socket connection: ${error instanceof Error ? error.message : "invalid token"}`);
      client.disconnect(true);
    }
  }

  afterInit(server: Server) {
    this.server = server;
  }

  emitUserChanged(userId: string, payload: Record<string, unknown> = {}) {
    this.server?.to(getUserNotificationRoom(userId)).emit("notifications:changed", {
      source: "notifications",
      ...payload
    });
  }

  disconnectUser(userId: string) {
    this.server?.in(getUserNotificationRoom(userId)).disconnectSockets(true);
  }

}
