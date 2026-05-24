import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { MarkNotificationsSeenDto } from "./dto/mark-notifications-seen.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("summary")
  getSummary(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getSummary(user.id);
  }

  @Get("feed")
  getFeed(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getFeed(user.id);
  }

  @Post("feed/seen")
  markFeedItemsSeen(@CurrentUser() user: AuthUser, @Body() dto: MarkNotificationsSeenDto) {
    return this.notificationsService.markFeedItemsSeen(user.id, dto);
  }
}
