import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { CreateRoomDto } from "./dto/create-room.dto";
import { SendRoomMessageDto } from "./dto/send-room-message.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";
import { RoomsGateway } from "./rooms.gateway";
import { RoomsService } from "./rooms.service";

@ApiTags("rooms")
@ApiBearerAuth()
@Controller()
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsGateway: RoomsGateway
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("public/rooms")
  getPublicRooms() {
    return this.roomsService.getPublicRooms();
  }

  @Get("rooms")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getRooms(@CurrentUser() user: AuthUser) {
    return this.roomsService.getActiveRooms(user.id);
  }

  @Get("rooms/:roomId/messages")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getRoomMessages(@CurrentUser() user: AuthUser, @Param("roomId") roomId: string) {
    return this.roomsService.getRoomMessages(user.id, roomId);
  }

  @Get("rooms/:roomId/members")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getRoomMembers(@CurrentUser() user: AuthUser, @Param("roomId") roomId: string) {
    return this.roomsService.getRoomMembers(user.id, roomId);
  }

  @Post("rooms/:roomId/join")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  joinRoom(@CurrentUser() user: AuthUser, @Param("roomId") roomId: string) {
    return this.roomsService.joinRoom(user.id, roomId);
  }

  @Post("rooms/:roomId/read")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  async markRoomRead(@CurrentUser() user: AuthUser, @Param("roomId") roomId: string) {
    const result = await this.roomsService.markRoomRead(user.id, roomId);
    await this.roomsGateway.emitNotificationChanged(roomId);

    return result;
  }

  @Post("rooms/:roomId/leave")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  leaveRoom(@CurrentUser() user: AuthUser, @Param("roomId") roomId: string) {
    return this.roomsService.leaveRoom(user.id, roomId);
  }

  @Post("rooms/:roomId/messages")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  async sendRoomMessage(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Body() dto: SendRoomMessageDto
  ) {
    const message = await this.roomsService.createRoomMessage(user.id, roomId, dto.body);
    this.roomsGateway.emitRoomMessage(roomId, message);
    await this.roomsGateway.emitNotificationChanged(roomId);

    return message;
  }

  @Get("admin/rooms")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getAdminRooms() {
    return this.roomsService.getAdminRooms();
  }

  @Post("admin/rooms")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  createRoom(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(user.id, dto);
  }

  @Put("admin/rooms/:roomId")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  updateRoom(@Param("roomId") roomId: string, @Body() dto: UpdateRoomDto) {
    return this.roomsService.updateRoom(roomId, dto);
  }
}
