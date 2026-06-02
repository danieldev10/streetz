import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { CompleteFaceVerificationDto } from "./dto/complete-face-verification.dto";
import { VerificationService } from "./verification.service";

@ApiTags("verification")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller("verification")
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get("me")
  getMyVerification(@CurrentUser() user: AuthUser) {
    return this.verificationService.getMyVerification(user.id);
  }

  @Post("face-liveness/session")
  createFaceLivenessSession(@CurrentUser() user: AuthUser) {
    return this.verificationService.createFaceLivenessSession(user.id);
  }

  @Post("face-liveness/result")
  completeFaceLivenessSession(@CurrentUser() user: AuthUser, @Body() dto: CompleteFaceVerificationDto) {
    return this.verificationService.completeFaceLivenessSession(user.id, dto.attemptId);
  }
}
