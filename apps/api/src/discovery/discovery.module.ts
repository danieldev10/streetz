import { Module } from "@nestjs/common";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";
import { VerificationModule } from "../verification/verification.module";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";

@Module({
  imports: [NotificationsModule, StorageModule, VerificationModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, ActiveSubscriptionGuard]
})
export class DiscoveryModule {}
