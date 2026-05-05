import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { NotificationsController } from "./notifications.controller";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, ActiveSubscriptionGuard],
  exports: [NotificationsService]
})
export class NotificationsModule {}
