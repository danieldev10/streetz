import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { StorageModule } from "../storage/storage.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, ActiveSubscriptionGuard],
  exports: [NotificationsService, NotificationsGateway]
})
export class NotificationsModule {}
