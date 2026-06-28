import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";
import { RafflesController } from "./raffles.controller";
import { RafflesService } from "./raffles.service";

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [RafflesController],
  providers: [RafflesService],
  exports: [RafflesService]
})
export class RafflesModule {}
