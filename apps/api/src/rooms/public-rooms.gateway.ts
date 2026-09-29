import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";
import { RoomsService } from "./rooms.service";

@WebSocketGateway({ namespace: "/public-rooms" })
export class PublicRoomsGateway {
  @WebSocketServer()
  private readonly server: Namespace;

  constructor(private readonly roomsService: RoomsService) {}

  @SubscribeMessage("public-room:join")
  async joinRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId?: string }) {
    try {
      const roomId = this.requireRoomId(body?.roomId);
      await this.roomsService.assertPublicRoomAvailable(roomId);
      await client.join(this.roomsService.getPublicSocketRoomName(roomId));

      return { ok: true, roomId };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage("public-room:leave")
  async leaveRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId?: string }) {
    try {
      const roomId = this.requireRoomId(body?.roomId);
      await client.leave(this.roomsService.getPublicSocketRoomName(roomId));

      return { ok: true, roomId };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  emitRoomMessage(roomId: string, message: unknown) {
    this.server.to(this.roomsService.getPublicSocketRoomName(roomId)).emit("public-room-message:new", message);
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
