import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import {
  BackgroundJob,
  BackgroundJobState,
  BackgroundJobType,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { enqueueJob } from "./enqueue-job";

@Injectable()
export class JobQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(leaseMs = 120_000, types?: BackgroundJobType[]) {
    // Database time and a fresh token fence acknowledgements from old owners.
    const rows = await this.prisma.$queryRaw<BackgroundJob[]>`
      WITH candidate AS (
        SELECT id FROM "BackgroundJob"
        WHERE ((state = 'PENDING' AND "runAt" <= (NOW() AT TIME ZONE 'UTC')) OR (state = 'RUNNING' AND "lockedUntil" <= (NOW() AT TIME ZONE 'UTC')))
          AND attempts < "maxAttempts" AND ("expiresAt" IS NULL OR "expiresAt" > (NOW() AT TIME ZONE 'UTC'))
          ${types?.length ? Prisma.sql`AND type IN (${Prisma.join(types.map((type) => Prisma.sql`${type}::"BackgroundJobType"`))})` : Prisma.empty}
        ORDER BY "runAt", "createdAt", id LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE "BackgroundJob" j SET state = 'RUNNING', "leaseToken" = ${randomUUID()},
          "lockedUntil" = (NOW() AT TIME ZONE 'UTC') + ${leaseMs} * INTERVAL '1 millisecond', attempts = attempts + 1, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
        FROM candidate WHERE j.id = candidate.id RETURNING j.*`;
    return rows[0] ?? null;
  }

  async renew(job: BackgroundJob, leaseMs: number) {
    return (
      (await this.prisma.$executeRaw`
      UPDATE "BackgroundJob" SET "lockedUntil" = (NOW() AT TIME ZONE 'UTC') + ${leaseMs} * INTERVAL '1 millisecond', "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE id = ${job.id} AND state = 'RUNNING' AND "leaseToken" = ${job.leaseToken} AND "lockedUntil" > (NOW() AT TIME ZONE 'UTC')`) ===
      1
    );
  }

  async complete(job: BackgroundJob) {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE "BackgroundJob" SET state = 'SUCCEEDED', "completedAt" = (NOW() AT TIME ZONE 'UTC'), "updatedAt" = (NOW() AT TIME ZONE 'UTC'),
          "leaseToken" = NULL, "lockedUntil" = NULL, "encryptedPayload" = NULL, "lastError" = NULL
        WHERE id = ${job.id} AND state = 'RUNNING' AND "leaseToken" = ${job.leaseToken} AND "lockedUntil" > (NOW() AT TIME ZONE 'UTC')`;
      if (changed && job.type === BackgroundJobType.TICKET_EMAIL) {
        await tx.ticketEmailDelivery.updateMany({
          where: { key: job.key.slice("ticket-email:".length), sentAt: null },
          data: { sentAt: new Date(), lockedUntil: null },
        });
      }
      return changed === 1;
    });
  }

  async fail(job: BackgroundJob, code: string, permanent = false) {
    const exhausted = permanent || job.attempts >= job.maxAttempts;
    const delay = Math.min(
      30 * 60_000,
      30_000 * 2 ** Math.min(job.attempts - 1, 6),
    );
    const changed = await this.prisma.$executeRaw`
      UPDATE "BackgroundJob" SET state = ${exhausted ? "FAILED" : "PENDING"}::"BackgroundJobState",
        "runAt" = (NOW() AT TIME ZONE 'UTC') + ${delay} * INTERVAL '1 millisecond', "failedAt" = CASE WHEN ${exhausted} THEN (NOW() AT TIME ZONE 'UTC') ELSE NULL END,
        "lastError" = ${code}, "leaseToken" = NULL, "lockedUntil" = NULL, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE id = ${job.id} AND state = 'RUNNING' AND "leaseToken" = ${job.leaseToken} AND "lockedUntil" > (NOW() AT TIME ZONE 'UTC')`;
    return { changed: changed === 1, exhausted };
  }

  async recover() {
    const exhausted = await this.prisma.$queryRaw<BackgroundJob[]>`
      UPDATE "BackgroundJob" SET state = 'FAILED', "failedAt" = (NOW() AT TIME ZONE 'UTC'), "lastError" = 'LEASE_RETRIES_EXHAUSTED',
        "leaseToken" = NULL, "lockedUntil" = NULL, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE state = 'RUNNING' AND "lockedUntil" <= (NOW() AT TIME ZONE 'UTC') AND attempts >= "maxAttempts" RETURNING *`;
    await this.prisma.$executeRaw`
      UPDATE "BackgroundJob" SET state = 'SUCCEEDED', "completedAt" = (NOW() AT TIME ZONE 'UTC'), "lastError" = 'EXPIRED',
        "encryptedPayload" = NULL, "leaseToken" = NULL, "lockedUntil" = NULL, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE (state = 'PENDING' OR (state = 'RUNNING' AND "lockedUntil" <= (NOW() AT TIME ZONE 'UTC'))) AND "expiresAt" <= (NOW() AT TIME ZONE 'UTC')`;
    // Failed jobs remain visible, but expired credentials must not be retained.
    await this.prisma.$executeRaw`
      UPDATE "BackgroundJob" SET "encryptedPayload" = NULL, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE state = 'FAILED' AND "expiresAt" <= (NOW() AT TIME ZONE 'UTC') AND "encryptedPayload" IS NOT NULL`;
    await this.prisma.$executeRaw`
      INSERT INTO "BackgroundJob" (id, key, type, payload, "runAt", "createdAt", "updatedAt")
      SELECT 'legacy-' || d.id, 'ticket-email:' || d.key, 'TICKET_EMAIL',
        jsonb_build_object('ticketIds', d."ticketIds", 'legacyDeliveryId', d.id),
        GREATEST(d."nextAttemptAt", COALESCE(d."lockedUntil", d."nextAttemptAt")), d."createdAt", (NOW() AT TIME ZONE 'UTC')
      FROM "TicketEmailDelivery" d WHERE d."sentAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "BackgroundJob" j WHERE j.key = 'ticket-email:' || d.key)
      ORDER BY d."createdAt" LIMIT 100 ON CONFLICT (key) DO NOTHING`;
    return exhausted;
  }

  async schedule(now = new Date()) {
    const bucket = Math.floor(now.getTime() / 300_000);
    await enqueueJob(this.prisma, {
      key: `reservation-cleanup:${bucket}`,
      type: BackgroundJobType.RESERVATION_CLEANUP,
      payload: {},
    });
    await enqueueJob(this.prisma, {
      key: `payment-scan:${bucket}`,
      type: BackgroundJobType.PAYMENT_SCAN,
      payload: {},
    });
  }

  async scanPayments() {
    // Each payment owns a single retry lifecycle; old terminal/failed jobs need
    // explicit operator review, rather than silently resetting their retries.
    await this.prisma.$executeRaw`
      INSERT INTO "BackgroundJob" (id, key, type, payload, "maxAttempts", "runAt", "createdAt", "updatedAt")
      SELECT 'reconcile-' || p.id, 'payment-reconcile:' || p.id, 'PAYMENT_RECONCILIATION',
        jsonb_build_object('paymentId', p.id), 20, (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC')
      FROM "Payment" p WHERE p.status = 'PENDING' AND p."createdAt" < (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 minute'
        AND p."createdAt" > (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'
        AND NOT EXISTS (SELECT 1 FROM "BackgroundJob" j WHERE j.key = 'payment-reconcile:' || p.id)
      ORDER BY p."createdAt" LIMIT 100 ON CONFLICT (key) DO NOTHING`;
    await this.prisma.backgroundJob.deleteMany({
      where: {
        state: BackgroundJobState.SUCCEEDED,
        completedAt: { lt: new Date(Date.now() - 7 * 86_400_000) },
      },
    });
    await this.prisma.backgroundWorkerHeartbeat.deleteMany({
      where: { lastSeenAt: { lt: new Date(Date.now() - 86_400_000) } },
    });
  }

  async inspect(state?: BackgroundJobState, cursor?: string, take = 50) {
    const [counts, workers, oldest, jobs] = await Promise.all([
      this.prisma.backgroundJob.groupBy({
        by: ["state", "type"],
        _count: true,
      }),
      this.prisma.backgroundWorkerHeartbeat.findMany({
        where: { lastSeenAt: { gt: new Date(Date.now() - 60_000) } },
        select: { id: true, lastSeenAt: true },
      }),
      this.prisma.backgroundJob.findFirst({
        where: { state: BackgroundJobState.PENDING },
        orderBy: { runAt: "asc" },
        select: { runAt: true },
      }),
      this.prisma.backgroundJob.findMany({
        where: { ...(state ? { state } : {}) },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          type: true,
          state: true,
          attempts: true,
          maxAttempts: true,
          runAt: true,
          lockedUntil: true,
          completedAt: true,
          failedAt: true,
          lastError: true,
          createdAt: true,
        },
      }),
    ]);
    const hasMore = jobs.length > take;
    return {
      counts,
      workers,
      oldestPendingAt: oldest?.runAt ?? null,
      jobs: jobs.slice(0, take),
      nextCursor: hasMore ? jobs[take - 1].id : null,
    };
  }

  async retry(id: string) {
    const changed = await this.prisma.$executeRaw`
      UPDATE "BackgroundJob" SET state = 'PENDING', attempts = 0, "runAt" = (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 millisecond', "failedAt" = NULL,
        "lastError" = NULL, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE id = ${id} AND state = 'FAILED' AND ("expiresAt" IS NULL OR "expiresAt" > (NOW() AT TIME ZONE 'UTC'))`;
    if (!changed) {
      if (
        !(await this.prisma.backgroundJob.findUnique({
          where: { id },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Job not found.");
      throw new ConflictException(
        "Only failed, unexpired jobs can be retried.",
      );
    }
    return { queued: true };
  }
}
