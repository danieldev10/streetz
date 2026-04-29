import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentPurpose, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

const SUBSCRIPTION_AMOUNT_KOBO = 100_000;
const SUBSCRIPTION_DAYS = 30;

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
    paid_at?: string;
    channel?: string;
    gateway_response?: string;
    customer?: {
      email?: string;
    };
  };
};

type PaystackWebhookBody = {
  event?: string;
  data?: {
    reference?: string;
  };
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async initializeSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("User not found.");
    }

    if (user.subscriptionStatus === SubscriptionStatus.ACTIVE && user.subscriptionEndsAt && user.subscriptionEndsAt > new Date()) {
      return {
        alreadyActive: true,
        subscriptionEndsAt: user.subscriptionEndsAt
      };
    }

    const reference = this.createReference();
    const callbackUrl = `${this.config.getOrThrow<string>("WEB_APP_URL")}/payment/callback`;

    const response = await this.callPaystack<PaystackInitializeResponse>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: SUBSCRIPTION_AMOUNT_KOBO,
        email: user.email,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: {
          userId,
          purpose: PaymentPurpose.SUBSCRIPTION,
          product: "Streetz monthly membership"
        }
      })
    });

    if (!response.status || !response.data?.authorization_url) {
      throw new BadRequestException(response.message || "Unable to initialize Paystack transaction.");
    }

    await this.prisma.payment.create({
      data: {
        userId,
        purpose: PaymentPurpose.SUBSCRIPTION,
        amountKobo: SUBSCRIPTION_AMOUNT_KOBO,
        providerReference: reference,
        providerMetadata: {
          accessCode: response.data.access_code
        }
      }
    });

    return {
      authorizationUrl: response.data.authorization_url,
      accessCode: response.data.access_code,
      reference
    };
  }

  async verifySubscriptionPayment(userId: string, reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference }
    });

    if (!payment || payment.userId !== userId || payment.purpose !== PaymentPurpose.SUBSCRIPTION) {
      throw new ForbiddenException("Payment reference is not valid for this user.");
    }

    return this.verifyAndActivateSubscription(reference);
  }

  async handlePaystackWebhook(signature: string | undefined, rawBody: Buffer | undefined, body: unknown) {
    if (!signature || !rawBody || !this.isValidSignature(signature, rawBody)) {
      throw new UnauthorizedException("Invalid Paystack webhook signature.");
    }

    const event = body as PaystackWebhookBody;
    const reference = event.data?.reference;

    if (reference && ["charge.success", "transaction.success", "transaction.successful"].includes(event.event ?? "")) {
      await this.verifyAndActivateSubscription(reference);
    }

    return { received: true };
  }

  private async verifyAndActivateSubscription(reference: string) {
    const response = await this.callPaystack<PaystackVerifyResponse>(`/transaction/verify/${reference}`, {
      method: "GET"
    });

    if (!response.status || !response.data) {
      throw new BadRequestException(response.message || "Unable to verify Paystack transaction.");
    }

    const paystackData = response.data;
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference },
      include: { user: true }
    });

    if (!payment) {
      throw new BadRequestException("Payment record not found.");
    }

    if (paystackData.status !== "success") {
      const mappedStatus = this.mapPaystackStatus(paystackData.status);

      await this.prisma.payment.update({
        where: { providerReference: reference },
        data: {
          status: mappedStatus,
          providerMetadata: paystackData
        }
      });

      return {
        status: mappedStatus,
        subscriptionStatus: payment.user.subscriptionStatus,
        subscriptionEndsAt: payment.user.subscriptionEndsAt
      };
    }

    if (paystackData.amount !== payment.amountKobo || paystackData.currency !== "NGN") {
      throw new BadRequestException("Verified payment amount or currency does not match Streetz membership.");
    }

    const now = new Date();
    const activeUntil = payment.user.subscriptionEndsAt && payment.user.subscriptionEndsAt > now
      ? payment.user.subscriptionEndsAt
      : now;
    const subscriptionEndsAt = new Date(activeUntil);
    subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + SUBSCRIPTION_DAYS);

    const [, user] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { providerReference: reference },
        data: {
          status: PaymentStatus.SUCCESS,
          providerMetadata: paystackData
        }
      }),
      this.prisma.user.update({
        where: { id: payment.userId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEndsAt
        }
      })
    ]);

    return {
      status: PaymentStatus.SUCCESS,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionEndsAt: user.subscriptionEndsAt
    };
  }

  private async callPaystack<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`https://api.paystack.co${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>("PAYSTACK_SECRET_KEY")}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    const data = (await response.json()) as T;

    if (!response.ok) {
      throw new BadRequestException((data as { message?: string }).message ?? "Paystack request failed.");
    }

    return data;
  }

  private createReference() {
    return `STZSUB-${Date.now()}-${randomBytes(6).toString("hex")}`;
  }

  private isValidSignature(signature: string, rawBody: Buffer) {
    const secret = this.config.getOrThrow<string>("PAYSTACK_SECRET_KEY");
    const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
    const signatureBuffer = Buffer.from(signature, "hex");
    const hashBuffer = Buffer.from(hash, "hex");

    return signatureBuffer.length === hashBuffer.length && timingSafeEqual(signatureBuffer, hashBuffer);
  }

  private mapPaystackStatus(status: string) {
    if (status === "failed") {
      return PaymentStatus.FAILED;
    }

    if (status === "abandoned") {
      return PaymentStatus.ABANDONED;
    }

    if (status === "reversed") {
      return PaymentStatus.REVERSED;
    }

    return PaymentStatus.PENDING;
  }
}
