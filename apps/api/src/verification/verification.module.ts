import { Module } from "@nestjs/common";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { StorageModule } from "../storage/storage.module";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";

@Module({
  imports: [StorageModule],
  controllers: [VerificationController],
  providers: [VerificationService, ActiveSubscriptionGuard],
  exports: [VerificationService]
})
export class VerificationModule {}
