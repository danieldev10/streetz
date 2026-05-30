import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { AccountStatus, User } from "@prisma/client";
import { compare } from "bcryptjs";
import { createHmac, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { ConfirmPasswordDto } from "./dto/confirm-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const REFRESH_TOKEN_DAYS = 30;
const REFRESH_TOKEN_BYTES = 48;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto);

    return this.buildAuthResponseWithRefresh(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (user.accountStatus === AccountStatus.DELETED) {
      throw new UnauthorizedException("This account has been deleted.");
    }

    return this.buildAuthResponseWithRefresh(user);
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is required.");
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!storedToken || storedToken.revokedAt !== null || storedToken.expiresAt <= new Date()) {
      throw new UnauthorizedException("Refresh session expired. Please log in again.");
    }

    if (storedToken.user.accountStatus === AccountStatus.DELETED) {
      await this.revokeAllRefreshTokens(storedToken.userId);
      throw new UnauthorizedException("This account has been deleted.");
    }

    const nextRefreshToken = this.createRawRefreshToken();
    const nextRefreshTokenExpiresAt = this.getRefreshTokenExpiresAt();
    const nextRefreshTokenHash = this.hashRefreshToken(nextRefreshToken);

    await this.prisma.$transaction(async (transaction) => {
      const createdToken = await transaction.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: nextRefreshTokenHash,
          expiresAt: nextRefreshTokenExpiresAt
        },
        select: { id: true }
      });

      await transaction.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: createdToken.id
        }
      });
    });

    return {
      ...this.buildAuthResponse(storedToken.user),
      refreshToken: nextRefreshToken,
      refreshTokenExpiresAt: nextRefreshTokenExpiresAt
    };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return { loggedOut: true };
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return { loggedOut: true };
  }

  async getSessionUser(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException("Session user no longer exists.");
    }

    return this.formatSessionUser(user);
  }

  async deactivateAccount(userId: string) {
    const user = await this.usersService.deactivateAccount(userId);

    return this.formatSessionUser(user);
  }

  async reactivateAccount(userId: string) {
    const user = await this.usersService.reactivateAccount(userId);

    return this.formatSessionUser(user);
  }

  async deleteAccount(userId: string, dto: ConfirmPasswordDto) {
    const user = await this.usersService.findById(userId);

    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid password.");
    }

    await this.usersService.softDeleteAccount(userId);
    await this.revokeAllRefreshTokens(userId);

    return { deleted: true };
  }

  private async buildAuthResponseWithRefresh(user: User) {
    const refreshToken = this.createRawRefreshToken();
    const refreshTokenExpiresAt = this.getRefreshTokenExpiresAt();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiresAt
      }
    });

    return {
      ...this.buildAuthResponse(user),
      refreshToken,
      refreshTokenExpiresAt
    };
  }

  private buildAuthResponse(user: User) {
    const signOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m") as JwtSignOptions["expiresIn"]
    };

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      signOptions
    );

    return {
      accessToken,
      user: this.formatSessionUser(user)
    };
  }

  private createRawRefreshToken() {
    return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  }

  private hashRefreshToken(refreshToken: string) {
    const secret = this.config.get<string>("JWT_REFRESH_SECRET") ?? this.config.getOrThrow<string>("JWT_ACCESS_SECRET");

    return createHmac("sha256", secret).update(refreshToken).digest("hex");
  }

  private getRefreshTokenExpiresAt() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    return expiresAt;
  }

  private revokeAllRefreshTokens(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  private formatSessionUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionEndsAt: user.subscriptionEndsAt,
      accountStatus: user.accountStatus,
      suspendedUntil: user.suspendedUntil,
      deactivatedAt: user.deactivatedAt,
      deletedAt: user.deletedAt,
      moderationReason: user.moderationReason,
      ageConfirmedAt: user.ageConfirmedAt
    };
  }
}
