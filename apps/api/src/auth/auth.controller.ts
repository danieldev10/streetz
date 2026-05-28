import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "./current-user.decorator";
import { AuthService } from "./auth.service";
import { ConfirmPasswordDto } from "./dto/confirm-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthUser } from "./types/auth-user";

const REFRESH_COOKIE_NAME = "crushclub_refresh_token";

type InternalAuthResponse = Awaited<ReturnType<AuthService["login"]>>;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const auth = await this.authService.register(dto);
    this.setRefreshCookie(response, auth);

    return this.toPublicAuthResponse(auth);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const auth = await this.authService.login(dto);
    this.setRefreshCookie(response, auth);

    return this.toPublicAuthResponse(auth);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("refresh")
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const auth = await this.authService.refresh(this.getRefreshToken(request));
    this.setRefreshCookie(response, auth);

    return this.toPublicAuthResponse(auth);
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.logout(this.getRefreshToken(request));
    this.clearRefreshCookie(response);

    return result;
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getSessionUser(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("account/deactivate")
  deactivateAccount(@CurrentUser() user: AuthUser) {
    return this.authService.deactivateAccount(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("account/reactivate")
  reactivateAccount(@CurrentUser() user: AuthUser) {
    return this.authService.reactivateAccount(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("account/delete")
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmPasswordDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.deleteAccount(user.id, dto);
    this.clearRefreshCookie(response);

    return result;
  }

  private toPublicAuthResponse(auth: InternalAuthResponse) {
    return {
      accessToken: auth.accessToken,
      user: auth.user
    };
  }

  private setRefreshCookie(response: Response, auth: InternalAuthResponse) {
    response.cookie(REFRESH_COOKIE_NAME, auth.refreshToken, {
      ...this.getRefreshCookieBaseOptions(),
      expires: auth.refreshTokenExpiresAt
    });
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie(REFRESH_COOKIE_NAME, this.getRefreshCookieBaseOptions());
  }

  private getRefreshCookieBaseOptions() {
    const isProduction = process.env.NODE_ENV === "production";
    const sameSite = this.getRefreshCookieSameSite(isProduction);

    return {
      httpOnly: true,
      secure: isProduction || sameSite === "none",
      sameSite,
      path: "/api/auth"
    } as const;
  }

  private getRefreshCookieSameSite(isProduction: boolean) {
    const configuredSameSite = process.env.REFRESH_COOKIE_SAME_SITE?.toLowerCase();

    if (configuredSameSite === "strict" || configuredSameSite === "lax" || configuredSameSite === "none") {
      return configuredSameSite;
    }

    return isProduction ? "none" : "lax";
  }

  private getRefreshToken(request: Request) {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return undefined;
    }

    for (const cookie of cookieHeader.split(";")) {
      const [rawName, ...rawValueParts] = cookie.trim().split("=");

      if (rawName === REFRESH_COOKIE_NAME) {
        try {
          return decodeURIComponent(rawValueParts.join("="));
        } catch {
          return undefined;
        }
      }
    }

    return undefined;
  }
}
