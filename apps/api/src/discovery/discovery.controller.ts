import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { DiscoveryService } from "./discovery.service";
import { BlockUserDto } from "./dto/block-user.dto";
import { DiscoveryActionDto } from "./dto/discovery-action.dto";
import { ReportUserDto } from "./dto/report-user.dto";

@ApiTags("discovery")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller("discovery")
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get("candidates")
  getCandidates(@CurrentUser() user: AuthUser) {
    return this.discoveryService.getCandidates(user.id);
  }

  @Post("actions")
  recordAction(@CurrentUser() user: AuthUser, @Body() dto: DiscoveryActionDto) {
    return this.discoveryService.recordAction(user.id, dto);
  }

  @Get("matches")
  getMatches(@CurrentUser() user: AuthUser) {
    return this.discoveryService.getMatches(user.id);
  }

  @Post("block")
  blockUser(@CurrentUser() user: AuthUser, @Body() dto: BlockUserDto) {
    return this.discoveryService.blockUser(user.id, dto);
  }

  @Post("report")
  reportUser(@CurrentUser() user: AuthUser, @Body() dto: ReportUserDto) {
    return this.discoveryService.reportUser(user.id, dto);
  }
}
