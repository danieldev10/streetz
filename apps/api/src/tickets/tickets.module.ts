import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { EventsModule } from "../events/events.module";
import { TicketDeliveryService } from "./ticket-delivery.service";
import { TicketDownloadsService } from "./ticket-downloads.service";
import { TicketDownloadsController } from "./ticket-downloads.controller";

@Module({ imports: [MailModule, EventsModule], providers: [TicketDeliveryService, TicketDownloadsService],
  controllers: [TicketDownloadsController] })
export class TicketsModule {}
