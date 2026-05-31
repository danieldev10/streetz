import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { AdminService } from "./admin.service";
import { ModerateReportUserDto } from "./dto/moderate-report-user.dto";
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

  @Get("users")
  getUsers() {
    return this.adminService.getUsers();
  }

  @Get("users/:userId")
  getUserActivity(@Param("userId") userId: string) {
    return this.adminService.getUserActivity(userId);
  }

  @Get("reports")
  getReports() {
    return this.adminService.getReports();
  }

  @Get("reports/:reportId")
  getReport(@Param("reportId") reportId: string) {
    return this.adminService.getReport(reportId);
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

  @Post("reports/:reportId/moderation")
  async moderateReportedUser(
    @CurrentUser() admin: AuthUser,
    @Param("reportId") reportId: string,
    @Body() dto: ModerateReportUserDto
  ) {
    const response = await this.adminService.moderateReportedUser(admin.id, reportId, dto);

    this.notificationsGateway.emitUserChanged(response.report.reporter.id, {
      source: "reports",
      reportId: response.report.id,
      status: response.report.status
    });

    this.notificationsGateway.emitUserChanged(response.report.reported.id, {
      source: "moderation",
      reportId: response.report.id,
      accountStatus: response.report.reported.accountStatus
    });

    return response;
  }
}
