import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { StorageModule } from "../storage/storage.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [JwtModule.register({}), StorageModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, ActiveSubscriptionGuard],
  exports: [NotificationsService, NotificationsGateway]
})
export class NotificationsModule {}
