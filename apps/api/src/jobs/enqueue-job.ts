import { BackgroundJobType, Prisma } from "@prisma/client";

export function enqueueJob(
  transaction: Prisma.TransactionClient,
  input: {
    key: string;
    type: BackgroundJobType;
    payload: Prisma.InputJsonObject;
    encryptedPayload?: string;
    runAt?: Date;
    expiresAt?: Date;
    maxAttempts?: number;
  },
) {
  const now = new Date();
  return transaction.backgroundJob.upsert({
    where: { key: input.key },
    create: { ...input, runAt: input.runAt ?? now, createdAt: now },
    update: {},
  });
}
