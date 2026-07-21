import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { MailModule } from "../mail/mail.module";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { GuestTicketsService } from "./guest-tickets.service";

@Module({
  imports: [StorageModule, MailModule],
  controllers: [EventsController],
  providers: [EventsService, GuestTicketsService],
  exports: [EventsService]
})
export class EventsModule {}
