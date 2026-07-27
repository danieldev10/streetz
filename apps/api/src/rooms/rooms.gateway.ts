import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthUser } from "../auth/types/auth-user";
import { RealtimeAuthService } from "../auth/realtime-auth.service";
import { getUserNotificationRoom } from "../notifications/notification-rooms";
import { RoomsService } from "./rooms.service";

type AuthenticatedSocket = Socket & {
  data: {
    user?: AuthUser;
  };
};

const NOTIFICATION_FANOUT_BATCH_SIZE = 500;

@WebSocketGateway()
export class RoomsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  constructor(
    private readonly roomsService: RoomsService,
    private readonly realtimeAuth: RealtimeAuthService
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const user = await this.realtimeAuth.authenticate(client);
      client.data.user = user;
      await client.join(getUserNotificationRoom(user.id));
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
      this.emitRoomReadNotification(user.id, roomId);

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
    @MessageBody() body: { roomId?: string; body?: string; gifUrl?: string }
  ) {
    try {
      const user = this.requireUser(client);
      const roomId = this.requireRoomId(body?.roomId);
      const message = await this.roomsService.createRoomMessage(user.id, roomId, body?.body, body?.gifUrl);

      this.emitRoomMessage(roomId, message);
      await this.emitRoomMessageNotification(roomId, user.id);

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

  emitRoomReadNotification(userId: string, roomId: string) {
    this.server.to(getUserNotificationRoom(userId)).emit("notifications:changed", {
      source: "rooms",
      kind: "room-read",
      roomId
    });
  }

  async emitRoomMessageNotification(roomId: string, authorId: string) {
    const memberUserIds = await this.roomsService.getRoomMemberUserIds(roomId, authorId);

    for (let index = 0; index < memberUserIds.length; index += NOTIFICATION_FANOUT_BATCH_SIZE) {
      const notificationRooms = memberUserIds
        .slice(index, index + NOTIFICATION_FANOUT_BATCH_SIZE)
        .map(getUserNotificationRoom);

      this.server.to(notificationRooms).emit("notifications:changed", {
        source: "rooms",
        kind: "room-message",
        roomId,
        unreadDelta: 1
      });
    }
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

  private errorResponse(error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Realtime action failed."
    };
  }
}
