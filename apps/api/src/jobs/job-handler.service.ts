import { Injectable } from "@nestjs/common";
import {
  BackgroundJob,
  BackgroundJobType,
  PaymentStatus,
} from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import { MailService } from "../mail/mail.service";
import { TicketDeliveryService } from "../tickets/ticket-delivery.service";
import { JobQueueService } from "./job-queue.service";
import { JobPayloadService } from "./job-payload.service";
import { JobError } from "./job-errors";

@Injectable()
export class JobHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly mail: MailService,
    private readonly tickets: TicketDeliveryService,
    private readonly queue: JobQueueService,
    private readonly payloads: JobPayloadService,
  ) {}

  async handle(
    job: BackgroundJob,
    beforeSideEffect: () => Promise<void> = async () => {},
  ) {
    const payload = job.payload as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new JobError("INVALID_JOB_PAYLOAD", true);
    const messageId = `<${createHash("sha256").update(job.key).digest("hex")}@jobs.crushclub.ng>`;
    switch (job.type) {
      case BackgroundJobType.TICKET_EMAIL: {
        if (
          !Array.isArray(payload.ticketIds) ||
          !payload.ticketIds.length ||
          !payload.ticketIds.every((id) => typeof id === "string")
        )
          throw new JobError("INVALID_TICKET_BATCH", true);
        if (typeof payload.legacyDeliveryId === "string") {
          const legacy = await this.prisma.ticketEmailDelivery.findUnique({
            where: { id: payload.legacyDeliveryId },
          });
          if (!legacy || legacy.sentAt) return;
        }
        const privatePayload = job.encryptedPayload
          ? this.payloads.decrypt<{ manageUrl: string }>(
              job.encryptedPayload,
              job.key,
            )
          : null;
        await this.tickets.deliver(
          payload.ticketIds as string[],
          messageId,
          privatePayload?.manageUrl,
          beforeSideEffect,
        );
        return;
      }
      case BackgroundJobType.PASSWORD_RESET_EMAIL: {
        const token = await this.prisma.passwordResetToken.findUnique({
          where: { id: this.entity(payload) },
          include: { user: true },
        });
        if (
          !token ||
          token.usedAt ||
          token.expiresAt <= new Date() ||
          token.user.accountStatus === "DELETED"
        )
          return;
        const input = this.payloads.decrypt<
          Parameters<MailService["sendPasswordResetEmail"]>[0]
        >(job.encryptedPayload, job.key);
        await beforeSideEffect();
        await this.sent(
          this.mail.sendPasswordResetEmail({
            ...input,
            messageId,
            expiresInMinutes: Math.max(
              1,
              Math.ceil((token.expiresAt.getTime() - Date.now()) / 60_000),
            ),
          }),
        );
        return;
      }
      case BackgroundJobType.GUEST_VERIFICATION_EMAIL: {
        const request = await this.prisma.guestTicketRequest.findUnique({
          where: { id: this.entity(payload) },
          include: { event: true },
        });
        if (
          !request ||
          request.consumedAt ||
          request.expiresAt <= new Date() ||
          request.event.status === "CANCELLED"
        )
          return;
        const input = this.payloads.decrypt<
          Parameters<MailService["sendGuestTicketVerificationEmail"]>[0]
        >(job.encryptedPayload, job.key);
        await beforeSideEffect();
        await this.sent(
          this.mail.sendGuestTicketVerificationEmail({
            ...input,
            messageId,
            expiresInMinutes: Math.max(
              1,
              Math.ceil((request.expiresAt.getTime() - Date.now()) / 60_000),
            ),
          }),
        );
        return;
      }
      case BackgroundJobType.SUPPORT_RECEIVED_EMAIL:
        if (
          !(await this.prisma.supportRequest.findUnique({
            where: { id: this.entity(payload) },
            select: { id: true },
          }))
        )
          return;
        await beforeSideEffect();
        await this.sent(
          this.mail.sendSupportRequestReceivedEmail({
            ...this.payloads.decrypt<
              Parameters<MailService["sendSupportRequestReceivedEmail"]>[0]
            >(job.encryptedPayload, job.key),
            messageId,
          }),
        );
        return;
      case BackgroundJobType.SUPPORT_REPLY_EMAIL:
        if (
          !(await this.prisma.supportRequest.findUnique({
            where: { id: this.entity(payload) },
            select: { id: true },
          }))
        )
          return;
        await beforeSideEffect();
        await this.sent(
          this.mail.sendSupportReplyEmail({
            ...this.payloads.decrypt<
              Parameters<MailService["sendSupportReplyEmail"]>[0]
            >(job.encryptedPayload, job.key),
            messageId,
          }),
        );
        return;
      case BackgroundJobType.RESERVATION_CLEANUP:
        await beforeSideEffect();
        await this.payments.cleanupExpiredTicketReservations();
        return;
      case BackgroundJobType.PAYMENT_SCAN:
        await beforeSideEffect();
        await this.queue.scanPayments();
        return;
      case BackgroundJobType.PAYMENT_RECONCILIATION: {
        if (typeof payload.paymentId !== "string")
          throw new JobError("INVALID_PAYMENT_JOB", true);
        const payment = await this.prisma.payment.findUnique({
          where: { id: payload.paymentId },
        });
        if (!payment || payment.status === PaymentStatus.SUCCESS) return;
        await beforeSideEffect();
        const result = await this.payments.verifyPaymentReference(
          payment.providerReference,
        );
        if (result.status === PaymentStatus.PENDING)
          throw new JobError("PAYMENT_STILL_PENDING");
        return;
      }
      default:
        throw new JobError("UNKNOWN_JOB_TYPE", true);
    }
  }

  private entity(payload: Record<string, unknown>) {
    if (typeof payload.entityId !== "string")
      throw new JobError("INVALID_EMAIL_JOB", true);
    return payload.entityId;
  }

  private async sent(result: Promise<boolean>) {
    if (!(await result)) throw new JobError("SMTP_NOT_CONFIGURED");
  }
}
