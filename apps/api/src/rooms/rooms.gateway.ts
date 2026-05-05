import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from "@nestjs/websockets";
import { UserRole } from "@prisma/client";
import { Server, Socket } from "socket.io";
import { AuthUser } from "../auth/types/auth-user";
import { getUserNotificationRoom } from "../notifications/notification-rooms";
import { RoomsService } from "./rooms.service";

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
export class RoomsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  constructor(
    private readonly roomsService: RoomsService,
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
      this.logger.warn(`Rejected room socket connection: ${error instanceof Error ? error.message : "invalid token"}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage("room:join")
  async joinRoom(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: { roomId?: string }) {
    try {
      const user = this.requireUser(client);
      const roomId = this.requireRoomId(body?.roomId);

      await this.roomsService.assertRoomParticipant(user.id, roomId);
      await this.roomsService.markRoomRead(user.id, roomId);
      await client.join(this.roomsService.getSocketRoomName(roomId));
      await this.emitNotificationChanged(roomId);

      return {
        ok: true,
        roomId
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage("room:leave")
  async leaveRoomSocket(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: { roomId?: string }) {
    try {
      this.requireUser(client);
      const roomId = this.requireRoomId(body?.roomId);

      await client.leave(this.roomsService.getSocketRoomName(roomId));

      return {
        ok: true,
        roomId
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage("room-message:send")
  async sendRoomMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId?: string; body?: string }
  ) {
    try {
      const user = this.requireUser(client);
      const roomId = this.requireRoomId(body?.roomId);
      const messageBody = this.requireMessageBody(body?.body);
      const message = await this.roomsService.createRoomMessage(user.id, roomId, messageBody);

      this.emitRoomMessage(roomId, message);
      await this.emitNotificationChanged(roomId);

      return {
        ok: true,
        message
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  emitRoomMessage(roomId: string, message: unknown) {
    this.server.to(this.roomsService.getSocketRoomName(roomId)).emit("room-message:new", message);
  }

  async emitNotificationChanged(roomId: string) {
    const memberUserIds = await this.roomsService.getRoomMemberUserIds(roomId);

    for (const userId of memberUserIds) {
      this.server.to(getUserNotificationRoom(userId)).emit("notifications:changed", {
        source: "rooms",
        roomId
      });
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

  private requireUser(client: AuthenticatedSocket) {
    const user = client.data.user;

    if (!user) {
      throw new WsException("Login is required.");
    }

    return user;
  }

  private requireRoomId(roomId: string | undefined) {
    if (!roomId?.trim()) {
      throw new WsException("roomId is required.");
    }

    return roomId.trim();
  }

  private requireMessageBody(body: string | undefined) {
    const trimmed = body?.trim();

    if (!trimmed) {
      throw new WsException("Message cannot be empty.");
    }

    if (trimmed.length > 1000) {
      throw new WsException("Message is too long.");
    }

    return trimmed;
  }

  private errorResponse(error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Realtime action failed."
    };
  }
}
