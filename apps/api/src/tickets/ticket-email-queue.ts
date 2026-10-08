import { BackgroundJobType, Prisma } from "@prisma/client";
import { enqueueJob } from "../jobs/enqueue-job";

/** Enqueue in the issuance transaction so confirmed tickets cannot lose their email job. */
export async function queueTicketEmail(transaction: Prisma.TransactionClient, key: string, ticketIds: string[], nextAttemptAt?: Date, encryptedPayload?: string) {
  return enqueueJob(transaction, { key: `ticket-email:${key}`, type: BackgroundJobType.TICKET_EMAIL,
    payload: { ticketIds }, runAt: nextAttemptAt, ...(encryptedPayload ? { encryptedPayload } : {}) });
}
