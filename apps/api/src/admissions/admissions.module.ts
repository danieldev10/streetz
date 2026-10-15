import { Module } from "@nestjs/common";
import { AdmissionsController, AdmissionsStaffController } from "./admissions.controller";
import { AdmissionsService } from "./admissions.service";

@Module({
  controllers: [AdmissionsController, AdmissionsStaffController],
  providers: [AdmissionsService],
  exports: [AdmissionsService]
})
export class AdmissionsModule {}
