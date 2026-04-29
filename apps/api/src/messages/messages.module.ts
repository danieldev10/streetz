import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { StorageModule } from "../storage/storage.module";
import { MessagesController } from "./messages.controller";
import { MessagesGateway } from "./messages.gateway";
import { MessagesService } from "./messages.service";

@Module({
  imports: [JwtModule.register({}), StorageModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, ActiveSubscriptionGuard],
  exports: [MessagesService, MessagesGateway]
})
export class MessagesModule {}
