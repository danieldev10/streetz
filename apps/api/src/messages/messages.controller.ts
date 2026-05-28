import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { SendDirectMessageDto } from "./dto/send-direct-message.dto";
import { MessagesGateway } from "./messages.gateway";
import { MessagesService } from "./messages.service";

@ApiTags("matches")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller("matches")
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagesGateway: MessagesGateway
  ) {}

  @Get()
  getMatches(@CurrentUser() user: AuthUser) {
    return this.messagesService.getMatches(user.id);
  }

  @Get(":matchId/messages")
  getMessages(@CurrentUser() user: AuthUser, @Param("matchId") matchId: string) {
    return this.messagesService.getMessages(user.id, matchId);
  }

  @Post(":matchId/unmatch")
  async unmatch(@CurrentUser() user: AuthUser, @Param("matchId") matchId: string) {
    const result = await this.messagesService.unmatch(user.id, matchId);
    await this.messagesGateway.emitMatchUnmatched(matchId, user.id);

    return result;
  }

  @Post(":matchId/messages")
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param("matchId") matchId: string,
    @Body() dto: SendDirectMessageDto
  ) {
    const message = await this.messagesService.createMessage(user.id, matchId, dto.body);
    this.messagesGateway.emitMessage(matchId, message);
    await this.messagesGateway.emitNotificationChanged(matchId);

    return message;
  }

  @Post(":matchId/read")
  async markMatchRead(@CurrentUser() user: AuthUser, @Param("matchId") matchId: string) {
    const result = await this.messagesService.markMatchRead(user.id, matchId);
    await this.messagesGateway.emitReadReceipt(matchId, user.id, result.readReceipt);
    await this.messagesGateway.emitNotificationChanged(matchId);

    return result;
  }
}
