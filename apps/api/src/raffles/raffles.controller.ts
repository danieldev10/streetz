import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { CreateRaffleDto } from "./dto/create-raffle.dto";
import { UpdateRaffleDto } from "./dto/update-raffle.dto";
import { RafflesService } from "./raffles.service";

@ApiTags("raffles")
@ApiBearerAuth()
@Controller()
export class RafflesController {
  constructor(private readonly rafflesService: RafflesService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("public/raffles")
  getPublicRaffles() {
    return this.rafflesService.getPublicRaffles();
  }

  @Get("raffles")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getRaffles(@CurrentUser() user: AuthUser) {
    return this.rafflesService.getPublishedRaffles(user.id);
  }

  @Get("raffles/:eventId")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getRaffle(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.rafflesService.getRaffle(user.id, eventId);
  }

  @Get("raffles/:eventId/entries")
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getMyRaffleEntries(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.rafflesService.getMyEntries(user.id, eventId);
  }

  @Get("admin/raffles")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getAdminRaffles() {
    return this.rafflesService.getAdminRaffles();
  }

  @Get("admin/raffles/:eventId")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getAdminRaffle(@Param("eventId") eventId: string) {
    return this.rafflesService.getAdminRaffle(eventId);
  }

  @Post("admin/raffles")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  createRaffle(@Body() dto: CreateRaffleDto) {
    return this.rafflesService.createRaffle(dto);
  }

  @Put("admin/raffles/:eventId")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  updateRaffle(@Param("eventId") eventId: string, @Body() dto: UpdateRaffleDto) {
    return this.rafflesService.updateRaffle(eventId, dto);
  }

  @Post("admin/raffles/:eventId/draw")
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  runRaffleDraw(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.rafflesService.runDraw(user.id, eventId);
  }
}
