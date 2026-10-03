import { Module } from "@nestjs/common";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";
import { VerificationModule } from "../verification/verification.module";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";
import { PublicDiscoveryController } from "./public-discovery.controller";

@Module({
  imports: [NotificationsModule, StorageModule, VerificationModule],
  controllers: [DiscoveryController, PublicDiscoveryController],
  providers: [DiscoveryService, ActiveSubscriptionGuard]
})
export class DiscoveryModule {}
