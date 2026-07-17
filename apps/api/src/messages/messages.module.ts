import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { StorageModule } from "../storage/storage.module";
import { MessagesController } from "./messages.controller";
import { MessagesGateway } from "./messages.gateway";
import { MessagesService } from "./messages.service";

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, ActiveSubscriptionGuard],
  exports: [MessagesService, MessagesGateway]
})
export class MessagesModule {}
