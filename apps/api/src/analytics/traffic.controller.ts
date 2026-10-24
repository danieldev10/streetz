import { Body, Controller, ExecutionContext, Get, Header, HttpCode, Injectable, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { BrowserOriginGuard } from "../auth/guards/browser-origin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/types/auth-user";
import { PageViewDto, TrafficQueryDto } from "./traffic.dto";
import { TrafficService } from "./traffic.service";

@Injectable()
export class OptionalTrafficAuthGuard extends JwtAuthGuard {
  canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest<Request>().headers.authorization) return true;
    return super.canActivate(context);
  }
}

@Controller("analytics")
export class TrafficController {
  constructor(private readonly traffic: TrafficService) {}

  @Post("page-view")
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(BrowserOriginGuard, OptionalTrafficAuthGuard)
  async record(@Body() input: PageViewDto, @Req() request: Request & { user?: AuthUser }) {
    if (request.user?.role === UserRole.ADMIN) return;
    // Exclude known crawlers, link previews, synthetic monitoring and test browsers.
    if (/bot|crawler|spider|preview|headless|uptime|monitor|lighthouse|facebookexternalhit/i.test(request.headers["user-agent"] ?? "")) return;
    await this.traffic.record(input, Boolean(request.user));
  }
}

@Controller("admin/traffic")
@Roles(UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminTrafficController {
  constructor(private readonly traffic: TrafficService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  totals(@Query() query: TrafficQueryDto) {
    return this.traffic.totals(query.period);
  }
}
