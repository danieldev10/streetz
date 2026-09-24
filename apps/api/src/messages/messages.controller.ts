import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { MessagePageDto } from "../common/dto/message-page.dto";
import { SendDirectMessageDto } from "./dto/send-direct-message.dto";
import { CreateConversationRequestDto } from "./dto/create-conversation-request.dto";
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
  getMessages(@CurrentUser() user: AuthUser, @Param("matchId") matchId: string, @Query() page: MessagePageDto) {
    return this.messagesService.getMessages(user.id, matchId, page);
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
    const message = await this.messagesService.createMessage(user.id, matchId, dto.body, dto.gifUrl);
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

@ApiTags("conversations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagesGateway: MessagesGateway
  ) {}

  @Get()
  getConversations(@CurrentUser() user: AuthUser) {
    return this.messagesService.getMatches(user.id);
  }

  @Get("requests")
  getRequests(@CurrentUser() user: AuthUser) {
    return this.messagesService.getConversationRequests(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("requests")
  async createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationRequestDto) {
    const result = await this.messagesService.createConversationRequest(user.id, dto.targetUserId, dto.body);
    if (result.message) {
      this.messagesGateway.emitMessage(result.conversation.id, result.message);
    }
    await this.messagesGateway.emitNotificationChanged(result.conversation.id, "conversation-request");
    return result;
  }

  @Post(":conversationId/accept")
  async acceptRequest(@CurrentUser() user: AuthUser, @Param("conversationId") conversationId: string) {
    const result = await this.messagesService.acceptConversationRequest(user.id, conversationId);
    await this.messagesGateway.emitNotificationChanged(conversationId, "conversation-accepted");
    return result;
  }

  @Post(":conversationId/decline")
  async declineRequest(@CurrentUser() user: AuthUser, @Param("conversationId") conversationId: string) {
    const result = await this.messagesService.declineConversationRequest(user.id, conversationId);
    await this.messagesGateway.emitNotificationChanged(conversationId, "conversation-declined");
    return result;
  }

  @Post(":conversationId/close")
  async closeConversation(@CurrentUser() user: AuthUser, @Param("conversationId") conversationId: string) {
    const result = await this.messagesService.closeConversation(user.id, conversationId);
    await this.messagesGateway.emitMatchUnmatched(conversationId, user.id);
    return result;
  }

  @Get(":conversationId/messages")
  getMessages(@CurrentUser() user: AuthUser, @Param("conversationId") conversationId: string, @Query() page: MessagePageDto) {
    return this.messagesService.getMessages(user.id, conversationId, page);
  }

  @Post(":conversationId/messages")
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param("conversationId") conversationId: string,
    @Body() dto: SendDirectMessageDto
  ) {
    const message = await this.messagesService.createMessage(user.id, conversationId, dto.body, dto.gifUrl);
    this.messagesGateway.emitMessage(conversationId, message);
    await this.messagesGateway.emitNotificationChanged(conversationId);
    return message;
  }

  @Post(":conversationId/read")
  async markRead(@CurrentUser() user: AuthUser, @Param("conversationId") conversationId: string) {
    const result = await this.messagesService.markMatchRead(user.id, conversationId);
    await this.messagesGateway.emitReadReceipt(conversationId, user.id, result.readReceipt);
    await this.messagesGateway.emitNotificationChanged(conversationId);
    return result;
  }
}
