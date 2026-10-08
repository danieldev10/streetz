import { Module } from "@nestjs/common";
import { JobQueueService } from "./job-queue.service";
import { JobPayloadService } from "./job-payload.service";

@Module({
  providers: [JobQueueService, JobPayloadService],
  exports: [JobQueueService, JobPayloadService],
})
export class JobsModule {}
