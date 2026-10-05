import { Prisma } from "@prisma/client";

/** Enqueue in the issuance transaction so confirmed tickets cannot lose their email job. */
export async function queueTicketEmail(transaction: Prisma.TransactionClient, key: string, ticketIds: string[], nextAttemptAt?: Date) {
  return transaction.ticketEmailDelivery.upsert({ where: { key }, create: { key, ticketIds, nextAttemptAt }, update: {} });
}
