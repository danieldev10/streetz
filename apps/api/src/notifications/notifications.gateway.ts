import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { OnGatewayConnection, WebSocketGateway, WsException } from "@nestjs/websockets";
import { UserRole } from "@prisma/client";
import { Socket } from "socket.io";
import { AuthUser } from "../auth/types/auth-user";
import { getUserNotificationRoom } from "./notification-rooms";

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

type AuthenticatedSocket = Socket & {
  data: {
    user?: AuthUser;
  };
};

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true
  }
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
      });

      client.data.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role
      };

      await client.join(getUserNotificationRoom(payload.sub));
    } catch (error) {
      this.logger.warn(`Rejected notification socket connection: ${error instanceof Error ? error.message : "invalid token"}`);
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === "string" && authToken.trim()) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;

    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length).trim();
    }

    throw new WsException("Authentication token is required.");
  }
}
