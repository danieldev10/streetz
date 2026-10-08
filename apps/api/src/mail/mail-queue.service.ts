import { Injectable } from "@nestjs/common";
import { BackgroundJobType, Prisma } from "@prisma/client";
import { enqueueJob } from "../jobs/enqueue-job";
import { JobPayloadService } from "../jobs/job-payload.service";

@Injectable()
export class MailQueueService {
  constructor(private readonly payloads: JobPayloadService) {}

  queue(
    transaction: Prisma.TransactionClient,
    key: string,
    type: BackgroundJobType,
    input: unknown,
    entityId: string,
    expiresAt?: Date,
  ) {
    return enqueueJob(transaction, {
      key,
      type,
      payload: { entityId },
      expiresAt,
      encryptedPayload: this.payloads.encrypt(input, key),
    });
  }

  encryptTicketLink(key: string, manageUrl: string) {
    return this.payloads.encrypt({ manageUrl }, `ticket-email:${key}`);
  }
}
