import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { DiscoveryService } from "./discovery.service";
import { BlockUserDto } from "./dto/block-user.dto";
import { DiscoveryActionDto } from "./dto/discovery-action.dto";
import { ReportUserDto } from "./dto/report-user.dto";
import { UnblockUserDto } from "./dto/unblock-user.dto";

@ApiTags("discovery")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller("discovery")
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly notificationsGateway: NotificationsGateway
  ) {}

  @Get("candidates")
  getCandidates(@CurrentUser() user: AuthUser) {
    return this.discoveryService.getCandidates(user.id);
  }

  @Post("actions")
  async recordAction(@CurrentUser() user: AuthUser, @Body() dto: DiscoveryActionDto) {
    const result = await this.discoveryService.recordAction(user.id, dto);

    this.notificationsGateway.emitUserChanged(user.id, {
      source: "discovery",
      targetUserId: dto.targetUserId,
      action: dto.action
    });

    if (dto.action === "LIKE") {
      this.notificationsGateway.emitUserChanged(dto.targetUserId, {
        source: "discovery",
        actorUserId: user.id,
        action: dto.action,
        matched: result.matched
      });
    }

    return result;
  }

  @Get("matches")
  getMatches(@CurrentUser() user: AuthUser) {
    return this.discoveryService.getMatches(user.id);
  }

  @Get("blocks")
  getBlockedUsers(@CurrentUser() user: AuthUser) {
    return this.discoveryService.getBlockedUsers(user.id);
  }

  @Post("block")
  async blockUser(@CurrentUser() user: AuthUser, @Body() dto: BlockUserDto) {
    const result = await this.discoveryService.blockUser(user.id, dto);

    this.notificationsGateway.emitUserChanged(user.id, {
      source: "blocks",
      targetUserId: dto.targetUserId,
      blocked: true
    });

    return result;
  }

  @Post("unblock")
  async unblockUser(@CurrentUser() user: AuthUser, @Body() dto: UnblockUserDto) {
    const result = await this.discoveryService.unblockUser(user.id, dto);

    this.notificationsGateway.emitUserChanged(user.id, {
      source: "blocks",
      targetUserId: dto.targetUserId,
      unblocked: true,
      matchRestored: result.matchRestored
    });

    if (result.matchRestored) {
      this.notificationsGateway.emitUserChanged(dto.targetUserId, {
        source: "matches",
        matchRestored: true
      });
    }

    return result;
  }

  @Post("report")
  reportUser(@CurrentUser() user: AuthUser, @Body() dto: ReportUserDto) {
    return this.discoveryService.reportUser(user.id, dto);
  }
}
