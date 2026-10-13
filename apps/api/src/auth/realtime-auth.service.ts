import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt/dist";
import { Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import { getAccountAccessBlock } from "../users/account-status";
import { AuthUser } from "./types/auth-user";
import { RedisRateLimitStore } from "../abuse/redis-rate-limit.store";

type JwtPayload = {
  sub: string;
  exp: number;
};

@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rates: RedisRateLimitStore,
  ) {}

  async authenticate(client: Socket): Promise<AuthUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(this.extractToken(client), {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TokenExpiredError") client.emit("auth:expired");
      throw new UnauthorizedException("Invalid or expired session.");
    }
    if (!Number.isFinite(payload.exp)) throw new UnauthorizedException("Session expiry is required.");
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        accountStatus: true,
        suspendedUntil: true
      }
    });

    if (!user) {
      throw new UnauthorizedException("Session user no longer exists.");
    }

    const accountBlock = getAccountAccessBlock(user);

    if (accountBlock) {
      throw new UnauthorizedException(accountBlock);
    }

    client.data.authExpiresAt = payload.exp * 1000;
    if (client.data.authExpiryTimer) clearTimeout(client.data.authExpiryTimer);
    const timer = setTimeout(() => {
      client.emit("auth:expired");
      client.disconnect(true);
    }, Math.min(2_147_483_647, Math.max(0, client.data.authExpiresAt - Date.now())));
    timer.unref();
    client.data.authExpiryTimer = timer;
    client.once("disconnect", () => clearTimeout(timer));

    return {
      id: user.id,
      email: user.email,
      role: user.role
    };
  }

  async authorizeAction(client: Socket, action: "join" | "send") {
    const user = client.data.user as AuthUser | undefined;
    if (!user || !(client.data.authExpiresAt > Date.now())) {
      client.emit("auth:expired");
      client.disconnect(true);
      throw new UnauthorizedException("Please refresh your session.");
    }
    const result = await this.rates.increment(`socket:${action}:${user.id}`, 60_000, action === "send" ? 30 : 60, 60_000, "socket");
    if (result.isBlocked) throw new UnauthorizedException("Too many realtime actions. Please try again later.");
    return user;
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

    throw new UnauthorizedException("Authentication token is required.");
  }
}
