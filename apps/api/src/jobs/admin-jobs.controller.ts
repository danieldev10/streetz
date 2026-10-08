import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
  Header,
} from "@nestjs/common";
import { BackgroundJobState, UserRole } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { JobQueueService } from "./job-queue.service";

class JobsQuery {
  @IsOptional() @IsEnum(BackgroundJobState) state?: BackgroundJobState;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take = 50;
}

@Controller("admin/jobs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminJobsController {
  private readonly logger = new Logger(AdminJobsController.name);
  constructor(private readonly queue: JobQueueService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  inspect(@Query() query: JobsQuery) {
    return this.queue.inspect(query.state, query.cursor, query.take);
  }

  @Post(":id/retry")
  @Header("Cache-Control", "private, no-store")
  async retry(@Param("id") id: string, @CurrentUser() admin: AuthUser) {
    const result = await this.queue.retry(id);
    this.logger.log({
      event: "background_job_manually_retried",
      jobId: id,
      adminId: admin.id,
    });
    return result;
  }
}
