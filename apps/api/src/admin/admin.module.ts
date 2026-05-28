import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [NotificationsModule, StorageModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
