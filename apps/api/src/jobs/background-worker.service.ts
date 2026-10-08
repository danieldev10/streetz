import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BackgroundJob } from "@prisma/client";
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/nestjs";
import { PrismaService } from "../prisma/prisma.service";
import { JobQueueService } from "./job-queue.service";
import { JobHandlerService } from "./job-handler.service";
import { JobError } from "./job-errors";

@Injectable()
export class BackgroundWorkerService implements OnModuleInit {
  private readonly logger = new Logger(BackgroundWorkerService.name);
  readonly id = randomUUID();
  private stopping = true;
  private loop?: Promise<void>;
  private wake?: () => void;
  private lastProgressAt = 0;
  private nextMaintenanceAt = 0;
  private heartbeat?: ReturnType<typeof setInterval>;
  private heartbeatRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueueService,
    private readonly handler: JobHandlerService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>("WORKER_ENABLED") === "false") return;
    this.stopping = false;
    this.loop = this.run();
    this.heartbeat = setInterval(() => void this.beat(), 10_000);
    this.heartbeat.unref();
  }

  ready() {
    return !this.stopping && Date.now() - this.lastProgressAt < 60_000;
  }

  async stop() {
    this.stopping = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.wake?.();
    await this.loop;
    // Drain before Prisma is closed. SIGKILL recovery uses persisted leases.
    while (this.heartbeatRunning)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await this.prisma.backgroundWorkerHeartbeat.deleteMany({
      where: { id: this.id },
    });
  }

  private async beat() {
    if (this.stopping || this.heartbeatRunning) return;
    this.heartbeatRunning = true;
    try {
      await this.prisma.backgroundWorkerHeartbeat.upsert({
        where: { id: this.id },
        create: { id: this.id, startedAt: new Date(), lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
      });
    } catch {
      this.logger.error({
        event: "worker_heartbeat_failed",
        workerId: this.id,
      });
    } finally {
      this.heartbeatRunning = false;
    }
  }

  private async run() {
    while (!this.stopping) {
      try {
        if (Date.now() >= this.nextMaintenanceAt) {
          for (const job of (await this.queue.recover()) ?? [])
            this.reportFailure(job, "LEASE_RETRIES_EXHAUSTED");
          await this.queue.schedule();
          await this.beat();
          this.nextMaintenanceAt = Date.now() + 15_000;
        }
        const concurrency = Number(
          this.config.get<string>("WORKER_CONCURRENCY") ?? "2",
        );
        const results = await Promise.allSettled(
          Array.from({ length: concurrency }, async () => {
            if (this.stopping) return;
            const job = await this.queue.claim(this.leaseMs());
            if (job) await this.process(job);
          }),
        );
        // A failed acknowledgement must not let the loop or shutdown abandon
        // another still-running handler in this batch.
        if (results.some((result) => result.status === "rejected"))
          throw new JobError("WORKER_BATCH_FAILED");
        this.lastProgressAt = Date.now();
      } catch {
        this.logger.error({
          event: "background_worker_pass_failed",
          workerId: this.id,
        });
      }
      if (!this.stopping)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(
            () => {
              this.wake = undefined;
              resolve();
            },
            Number(this.config.get<string>("WORKER_POLL_MS") ?? "1000"),
          );
          this.wake = () => {
            clearTimeout(timer);
            this.wake = undefined;
            resolve();
          };
        });
    }
  }

  async process(job: BackgroundJob) {
    let lostLease = false;
    let renewing: Promise<void> | undefined;
    const timer = setInterval(
      () => {
        if (renewing) return;
        renewing = this.queue
          .renew(job, this.leaseMs())
          .then(
            (owned) => {
              if (!owned) lostLease = true;
            },
            () => {
              lostLease = true;
            },
          )
          .finally(() => {
            renewing = undefined;
          });
      },
      Math.floor(this.leaseMs() / 3),
    );
    timer.unref();
    const finishRenewing = async () => {
      clearInterval(timer);
      await renewing;
    };
    try {
      await this.handler.handle(job, async () => {
        await renewing;
        if (lostLease || !(await this.queue.renew(job, this.leaseMs()))) {
          lostLease = true;
          throw new JobError("JOB_LEASE_LOST");
        }
      });
      await finishRenewing();
      if (!lostLease && !(await this.queue.complete(job))) lostLease = true;
    } catch (error) {
      await finishRenewing();
      if (!lostLease) {
        const code =
          error instanceof JobError ? error.code : "JOB_HANDLER_FAILED";
        const result = await this.queue.fail(
          job,
          code,
          error instanceof JobError && error.permanent,
        );
        if (result.changed) {
          this.logger[result.exhausted ? "error" : "warn"]({
            event: result.exhausted
              ? "background_job_failed"
              : "background_job_retry",
            jobId: job.id,
            type: job.type,
            attempts: job.attempts,
            code,
          });
          if (result.exhausted) this.reportFailure(job, code);
        }
      }
    } finally {
      await finishRenewing();
      if (lostLease)
        this.logger.warn({
          event: "background_job_lease_lost",
          jobId: job.id,
          type: job.type,
        });
    }
  }

  private leaseMs() {
    return Number(this.config.get<string>("WORKER_LEASE_MS") ?? "120000");
  }

  private reportFailure(job: BackgroundJob, code: string) {
    this.logger.error({
      event: "background_job_exhausted",
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      code,
    });
    Sentry.captureMessage(`Background job exhausted: ${job.type}`, {
      level: "error",
      tags: { jobType: job.type, failureCode: code },
      extra: { jobId: job.id, attempts: job.attempts },
    });
  }
}
