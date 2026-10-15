import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { JobsModule } from "../jobs/jobs.module";
import { AdminJobsController } from "../jobs/admin-jobs.controller";
import { AdmissionsModule } from "../admissions/admissions.module";

@Module({
  imports: [NotificationsModule, StorageModule, UsersModule, JobsModule, AdmissionsModule],
  controllers: [AdminController, AdminJobsController],
  providers: [AdminService]
})
export class AdminModule {}
