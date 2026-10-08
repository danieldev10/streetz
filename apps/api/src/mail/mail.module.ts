import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { MailQueueService } from "./mail-queue.service";
import { JobsModule } from "../jobs/jobs.module";

@Module({
  imports: [JobsModule],
  providers: [MailService, MailQueueService],
  exports: [MailService, MailQueueService]
})
export class MailModule {}
