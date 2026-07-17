import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt/dist";
import { Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import { getAccountAccessBlock } from "../users/account-status";
import { AuthUser } from "./types/auth-user";

type JwtPayload = {
  sub: string;
};

@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async authenticate(client: Socket): Promise<AuthUser> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(this.extractToken(client), {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
    });
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

    return {
      id: user.id,
      email: user.email,
      role: user.role
    };
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
