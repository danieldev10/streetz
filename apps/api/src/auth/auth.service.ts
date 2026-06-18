import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt/dist";
import { AccountStatus, User } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHmac, randomBytes } from "crypto";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { getAccountAccessBlock } from "../users/account-status";
import { UsersService } from "../users/users.service";
import { ConfirmPasswordDto } from "./dto/confirm-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

const REFRESH_TOKEN_DAYS = 30;
const REFRESH_TOKEN_BYTES = 48;
const PASSWORD_RESET_TOKEN_BYTES = 48;
const PASSWORD_RESET_TOKEN_MINUTES = 30;
const PASSWORD_RESET_RESPONSE_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) { }

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

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user || user.accountStatus === AccountStatus.DELETED) {
      return { message: PASSWORD_RESET_RESPONSE_MESSAGE };
    }

    const resetToken = this.createRawPasswordResetToken();
    const expiresAt = this.getPasswordResetTokenExpiresAt();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() }
        },
        data: {
          usedAt: new Date()
        }
      });

      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashPasswordResetToken(resetToken),
          expiresAt
        }
      });
    });

    const resetUrl = this.buildPasswordResetUrl(resetToken);
    await this.sendPasswordResetEmail(user, email, resetUrl);

    if (process.env.NODE_ENV !== "production") {
      this.logger.warn(`Password reset link for ${email}: ${resetUrl}`);
    }

    return {
      message: PASSWORD_RESET_RESPONSE_MESSAGE,
      ...(process.env.NODE_ENV !== "production" ? { resetUrl } : {})
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashPasswordResetToken(dto.token);
    const storedToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (
      !storedToken ||
      storedToken.usedAt !== null ||
      storedToken.expiresAt <= new Date() ||
      storedToken.user.accountStatus === AccountStatus.DELETED
    ) {
      throw new BadRequestException("Password reset link is invalid or expired.");
    }

    const passwordHash = await hash(dto.password, 12);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: storedToken.userId },
        data: { passwordHash }
      });

      await transaction.passwordResetToken.updateMany({
        where: {
          userId: storedToken.userId,
          usedAt: null
        },
        data: {
          usedAt: now
        }
      });

      await transaction.refreshToken.updateMany({
        where: {
          userId: storedToken.userId,
          revokedAt: null
        },
        data: {
          revokedAt: now
        }
      });
    });

    return { reset: true };
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
      throw new UnauthorizedException("Session expired. Please log in again.");
    }

    // DEACTIVATED is reversible and self-service, so allow it to refresh — the
    // reactivate flow needs a valid session. Every other block (DELETED, BANNED,
    // active SUSPENDED) rejects the refresh; getAccountAccessBlock also honours
    // suspendedUntil so an expired suspension is no longer treated as a block.
    const accountBlock = getAccountAccessBlock(storedToken.user);

    if (accountBlock && storedToken.user.accountStatus !== AccountStatus.DEACTIVATED) {
      // Permanent states wipe every session; a temporary suspension only rejects
      // this refresh so access resumes automatically once it lifts.
      if (storedToken.user.accountStatus !== AccountStatus.SUSPENDED) {
        await this.revokeAllRefreshTokens(storedToken.userId);
      }

      throw new UnauthorizedException(accountBlock);
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

  private createRawPasswordResetToken() {
    return randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
  }

  private hashPasswordResetToken(resetToken: string) {
    const secret =
      this.config.get<string>("PASSWORD_RESET_SECRET") ??
      this.config.get<string>("JWT_REFRESH_SECRET") ??
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET");

    return createHmac("sha256", secret).update(resetToken).digest("hex");
  }

  private getPasswordResetTokenExpiresAt() {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + PASSWORD_RESET_TOKEN_MINUTES);

    return expiresAt;
  }

  private buildPasswordResetUrl(resetToken: string) {
    const appUrl = this.config.get<string>("WEB_APP_URL") ?? "http://localhost:3000";

    return `${appUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`;
  }

  private async sendPasswordResetEmail(user: User, email: string, resetUrl: string) {
    try {
      await this.mailService.sendPasswordResetEmail({
        to: email,
        resetUrl,
        expiresInMinutes: PASSWORD_RESET_TOKEN_MINUTES,
        displayName: user.displayName
      });
    } catch (error) {
      this.logger.error(
        `Password reset email failed for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
      ageConfirmedAt: user.ageConfirmedAt,
      faceVerificationStatus: user.faceVerificationStatus,
      faceVerificationVerifiedAt: user.faceVerificationVerifiedAt,
      faceVerificationOverrideReason: user.faceVerificationOverrideReason
    };
  }
}
