import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { CreateEventDto } from "./dto/create-event.dto";
import { PresignEventImageDto } from "./dto/presign-event-image.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventsService } from "./events.service";

@ApiTags("events")
@ApiBearerAuth()
@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get("events")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getEvents(@CurrentUser() user: AuthUser) {
    return this.eventsService.getPublishedEvents(user.id);
  }

  @Post("events/:eventId/book")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  bookFreeEvent(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventsService.bookFreeEvent(user.id, eventId);
  }

  @Get("admin/events")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getAdminEvents() {
    return this.eventsService.getAdminEvents();
  }

  @Post("admin/events")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  createEvent(@Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(dto);
  }

  @Post("admin/events/images/presign")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  createEventImageUpload(@CurrentUser() user: AuthUser, @Body() dto: PresignEventImageDto) {
    return this.eventsService.createEventImageUpload(user.id, dto);
  }

  @Put("admin/events/:eventId")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  updateEvent(@Param("eventId") eventId: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.updateEvent(eventId, dto);
  }
}
