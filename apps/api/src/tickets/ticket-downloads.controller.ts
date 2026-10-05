import { Controller, Get, Header, Param, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { TicketDownloadsService } from "./ticket-downloads.service";

@Controller()
export class TicketDownloadsController {
  constructor(private readonly downloads: TicketDownloadsService) {}

  @Get("events/:eventId/tickets/download")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  async memberTickets(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.file(await this.downloads.downloadMemberTickets(user.id, eventId));
  }

  @Get("public/guest-ticket-orders/:orderId/download")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @Header("Referrer-Policy", "no-referrer")
  async guestTickets(@Param("orderId") orderId: string, @Query("token") token?: string) {
    return this.file(await this.downloads.downloadGuestTickets(orderId, token));
  }

  private file(buffer: Buffer) {
    return new StreamableFile(buffer, { type: "application/pdf", disposition: 'attachment; filename="crushclub-tickets.pdf"' });
  }
}
