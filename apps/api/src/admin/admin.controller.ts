import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { AdminService } from "./admin.service";
import { UpdateReportStatusDto } from "./dto/update-report-status.dto";

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
@Roles(UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly notificationsGateway: NotificationsGateway
  ) {}

  @Get("metrics")
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get("reports")
  getReports() {
    return this.adminService.getReports();
  }

  @Put("reports/:reportId/status")
  async updateReportStatus(@Param("reportId") reportId: string, @Body() dto: UpdateReportStatusDto) {
    const response = await this.adminService.updateReportStatus(reportId, dto.status);

    this.notificationsGateway.emitUserChanged(response.report.reporter.id, {
      source: "reports",
      reportId: response.report.id,
      status: response.report.status
    });

    return response;
  }
}
