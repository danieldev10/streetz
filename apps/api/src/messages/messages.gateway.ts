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
import { MessagesService } from "./messages.service";

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
export class MessagesGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private readonly messagesService: MessagesService,
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
    } catch (error) {
      this.logger.warn(`Rejected socket connection: ${error instanceof Error ? error.message : "invalid token"}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage("match:join")
  async joinMatch(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: { matchId?: string }) {
    try {
      const user = this.requireUser(client);
      const matchId = this.requireMatchId(body?.matchId);

      await this.messagesService.assertMatchParticipant(user.id, matchId);
      await client.join(this.messagesService.getRoomName(matchId));

      return {
        ok: true,
        matchId
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage("direct-message:send")
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { matchId?: string; body?: string }
  ) {
    try {
      const user = this.requireUser(client);
      const matchId = this.requireMatchId(body?.matchId);
      const messageBody = this.requireMessageBody(body?.body);
      const message = await this.messagesService.createMessage(user.id, matchId, messageBody);

      this.emitMessage(matchId, message);

      return {
        ok: true,
        message
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  emitMessage(matchId: string, message: unknown) {
    this.server.to(this.messagesService.getRoomName(matchId)).emit("direct-message:new", message);
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

  private requireMatchId(matchId: string | undefined) {
    if (!matchId?.trim()) {
      throw new WsException("matchId is required.");
    }

    return matchId.trim();
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
