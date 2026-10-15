import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, MaxLength } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { CheckInTicketDto } from "../admin/dto/check-in-ticket.dto";
import { AdmissionsService } from "./admissions.service";

class AssignStaffDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

@Controller("admissions")
@UseGuards(JwtAuthGuard)
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get("events")
  @Header("Cache-Control", "private, no-store")
  events(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.admissions.listEvents(user.id, cursor);
  }

  @Get("events/:eventId")
  @Header("Cache-Control", "private, no-store")
  event(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.admissions.getEvent(user.id, eventId);
  }

  @Post("events/:eventId/check-in")
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() dto: CheckInTicketDto
  ) {
    return this.admissions.checkInTicket(user.id, eventId, dto.code);
  }
}

// Authorization is checked against the current database role for every request,
// so a stale JWT cannot retain admin privileges or a revoked staff assignment.
@Controller("admin/events/:eventId/check-in-staff")
@UseGuards(JwtAuthGuard)
export class AdmissionsStaffController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.admissions.listStaff(user.id, eventId);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  assign(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() dto: AssignStaffDto
  ) {
    return this.admissions.assignStaff(user.id, eventId, dto.email);
  }

  @Delete(":userId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("userId") userId: string
  ) {
    return this.admissions.removeStaff(user.id, eventId, userId);
  }
}
