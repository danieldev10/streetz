import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt/dist";
import { PassportModule } from "@nestjs/passport";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RealtimeAuthService } from "./realtime-auth.service";
import { RolesGuard } from "./guards/roles.guard";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { BrowserOriginGuard } from "./guards/browser-origin.guard";
import { RateLimitsModule } from "../abuse/rate-limits.module";

@Module({
  imports: [UsersModule, PrismaModule, MailModule, PassportModule, JwtModule.register({}), RateLimitsModule],
  controllers: [AuthController],
  providers: [AuthService, RealtimeAuthService, JwtStrategy, RolesGuard, BrowserOriginGuard],
  exports: [AuthService, RealtimeAuthService]
})
export class AuthModule {}
