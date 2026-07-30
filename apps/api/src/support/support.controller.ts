import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { AdminReplySupportRequestDto, AdminSupportListDto, UpdateSupportRequestDto } from "./dto/admin-support.dto";
import { CreateGuestSupportRequestDto, CreateSupportRequestDto } from "./dto/create-support-request.dto";
import { ReplySupportRequestDto } from "./dto/reply-support-request.dto";
import { SupportService } from "./support.service";

@ApiTags("support")
@Controller("support")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("requests")
  createGuestRequest(@Body() dto: CreateGuestSupportRequestDto) {
    return this.supportService.createGuestRequest(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("requests/me")
  createMemberRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateSupportRequestDto) {
    return this.supportService.createMemberRequest(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("requests/me")
  listMemberRequests(@CurrentUser() user: AuthUser) {
    return this.supportService.listMemberRequests(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("requests/me/:requestId")
  getMemberRequest(@CurrentUser() user: AuthUser, @Param("requestId") requestId: string) {
    return this.supportService.getMemberRequest(user.id, requestId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("requests/me/:requestId/messages")
  replyAsMember(
    @CurrentUser() user: AuthUser,
    @Param("requestId") requestId: string,
    @Body() dto: ReplySupportRequestDto
  ) {
    return this.supportService.replyAsMember(user.id, requestId, dto.message);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("requests/:requestId/manage")
  getGuestRequest(
    @Param("requestId") requestId: string,
    @Query("token") token: string | undefined
  ) {
    return this.supportService.getGuestRequest(requestId, token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("requests/:requestId/manage/messages")
  replyAsGuest(
    @Param("requestId") requestId: string,
    @Query("token") token: string | undefined,
    @Body() dto: ReplySupportRequestDto
  ) {
    return this.supportService.replyAsGuest(requestId, token, dto.message);
  }
}

@ApiTags("admin support")
@ApiBearerAuth()
@Controller("admin/support")
@Roles(UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get("requests")
  listRequests(@Query() filters: AdminSupportListDto) {
    return this.supportService.listAdminRequests(filters);
  }

  @Get("requests/:requestId")
  getRequest(@Param("requestId") requestId: string) {
    return this.supportService.getAdminRequest(requestId);
  }

  @Post("requests/:requestId/messages")
  reply(
    @CurrentUser() admin: AuthUser,
    @Param("requestId") requestId: string,
    @Body() dto: AdminReplySupportRequestDto
  ) {
    return this.supportService.replyAsAdmin(admin.id, requestId, dto);
  }

  @Post("requests/:requestId")
  update(
    @Param("requestId") requestId: string,
    @Body() dto: UpdateSupportRequestDto
  ) {
    return this.supportService.updateAdminRequest(requestId, dto);
  }
}
