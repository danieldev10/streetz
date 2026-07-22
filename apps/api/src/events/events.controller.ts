import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { BookEventDto } from "./dto/book-event.dto";
import { ConfirmGuestTicketDto } from "./dto/confirm-guest-ticket.dto";
import { CreateEventDto } from "./dto/create-event.dto";
import { PresignEventImageDto } from "./dto/presign-event-image.dto";
import { RequestGuestTicketDto } from "./dto/request-guest-ticket.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventsService } from "./events.service";
import { GuestTicketsService } from "./guest-tickets.service";

@ApiTags("events")
@ApiBearerAuth()
@Controller()
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly guestTicketsService: GuestTicketsService
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("public/events")
  getPublicEvents() {
    return this.eventsService.getPublicEvents();
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("public/events/:eventId")
  getPublicEvent(@Param("eventId") eventId: string) {
    return this.eventsService.getPublicEvent(eventId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("public/events/:eventId/guest-tickets/request")
  requestGuestTicket(@Param("eventId") eventId: string, @Body() dto: RequestGuestTicketDto) {
    return this.guestTicketsService.requestVerification(eventId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("public/events/:eventId/guest-tickets/confirm")
  confirmGuestTicket(@Param("eventId") eventId: string, @Body() dto: ConfirmGuestTicketDto) {
    return this.guestTicketsService.confirmBooking(eventId, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("public/guest-ticket-orders/:orderId")
  getManagedGuestTickets(@Param("orderId") orderId: string, @Query("token") token?: string) {
    return this.guestTicketsService.getManagedBooking(orderId, token);
  }

  @Get("events")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getEvents(@CurrentUser() user: AuthUser) {
    return this.eventsService.getPublishedEvents(user.id);
  }

  @Get("events/history")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getEventHistory(@CurrentUser() user: AuthUser) {
    return this.eventsService.getEventHistory(user.id);
  }

  @Get("events/:eventId/tickets")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getEventTickets(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventsService.getEventTickets(user.id, eventId);
  }

  @Post("events/:eventId/book")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  bookFreeEvent(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string, @Body() dto: BookEventDto) {
    return this.eventsService.bookFreeEvent(user.id, eventId, dto);
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
