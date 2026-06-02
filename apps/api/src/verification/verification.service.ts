import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CompareFacesCommand,
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  RekognitionClient
} from "@aws-sdk/client-rekognition";
import { FaceVerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

type FaceVerificationMode = "off" | "observe" | "prototype-pass" | "enforce";

type VerificationImage = {
  Bytes?: Uint8Array;
  S3Object?: {
    Bucket?: string;
    Name?: string;
    Version?: string;
  };
};

const DEFAULT_LIVENESS_THRESHOLD = 90;
const DEFAULT_FACE_MATCH_THRESHOLD = 90;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService
  ) {}

  async getMyVerification(userId: string) {
    const [user, latestAttempt] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          faceVerificationStatus: true,
          faceVerificationVerifiedAt: true,
          faceVerificationOverrideReason: true
        }
      }),
      this.prisma.faceVerificationAttempt.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" }
      })
    ]);

    if (!user) {
      throw new ForbiddenException("Session user no longer exists.");
    }

    return {
      mode: this.getMode(),
      enabled: this.isEnabled(),
      required: this.isRequired(),
      status: user.faceVerificationStatus,
      verifiedAt: user.faceVerificationVerifiedAt,
      overrideReason: user.faceVerificationOverrideReason,
      latestAttempt: latestAttempt
        ? {
            id: latestAttempt.id,
            status: latestAttempt.status,
            effectiveStatus: latestAttempt.effectiveStatus,
            livenessConfidence: latestAttempt.livenessConfidence,
            faceMatchSimilarity: latestAttempt.faceMatchSimilarity,
            failureReason: latestAttempt.failureReason,
            overrideReason: latestAttempt.overrideReason,
            completedAt: latestAttempt.completedAt,
            createdAt: latestAttempt.createdAt
          }
        : null
    };
  }

  async createFaceLivenessSession(userId: string) {
    this.ensureEnabled();

    const photoCount = await this.prisma.profilePhoto.count({
      where: { userId }
    });

    if (photoCount === 0) {
      throw new BadRequestException("Add at least one profile photo before verifying your face.");
    }

    const attempt = await this.prisma.faceVerificationAttempt.create({
      data: {
        userId,
        status: FaceVerificationStatus.PENDING,
        auditImagePrefix: this.buildAuditImagePrefix(userId)
      }
    });

    const response = await this.getClient().send(
      new CreateFaceLivenessSessionCommand({
        ClientRequestToken: attempt.id,
        Settings: {
          AuditImagesLimit: 2,
          OutputConfig: {
            S3Bucket: this.getVerificationBucket(),
            S3KeyPrefix: attempt.auditImagePrefix ?? undefined
          }
        }
      })
    );

    if (!response.SessionId) {
      throw new BadGatewayException("Face verification session could not be created.");
    }

    const updatedAttempt = await this.prisma.faceVerificationAttempt.update({
      where: { id: attempt.id },
      data: {
        providerSessionId: response.SessionId,
        referenceImageBucket: this.getVerificationBucket()
      }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        faceVerificationStatus: FaceVerificationStatus.PENDING,
        faceVerificationOverrideReason: null
      }
    });

    return {
      attemptId: updatedAttempt.id,
      sessionId: response.SessionId,
      region: this.getRegion()
    };
  }

  async completeFaceLivenessSession(userId: string, attemptId: string) {
    this.ensureEnabled();

    const attempt = await this.prisma.faceVerificationAttempt.findFirst({
      where: {
        id: attemptId,
        userId
      }
    });

    if (!attempt?.providerSessionId) {
      throw new BadRequestException("Face verification session was not found.");
    }

    const result = await this.getClient().send(
      new GetFaceLivenessSessionResultsCommand({
        SessionId: attempt.providerSessionId
      })
    );

    const providerStatus = await this.getProviderStatus(userId, result.Status, result.Confidence, result.ReferenceImage as VerificationImage | undefined);
    const effectiveStatus = this.getEffectiveStatus(providerStatus.status);
    const overrideReason = effectiveStatus !== providerStatus.status ? "PROTOTYPE_BYPASS" : null;
    const completedAt = new Date();

    const updatedAttempt = await this.prisma.faceVerificationAttempt.update({
      where: { id: attempt.id },
      data: {
        status: providerStatus.status,
        effectiveStatus,
        livenessConfidence: result.Confidence ?? null,
        faceMatchSimilarity: providerStatus.faceMatchSimilarity,
        matchedPhotoId: providerStatus.matchedPhotoId,
        referenceImageBucket: providerStatus.referenceImageBucket ?? attempt.referenceImageBucket,
        referenceImageKey: providerStatus.referenceImageKey,
        failureReason: providerStatus.failureReason,
        overrideReason,
        completedAt
      }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        faceVerificationStatus: effectiveStatus,
        faceVerificationVerifiedAt: effectiveStatus === FaceVerificationStatus.VERIFIED ? completedAt : null,
        faceVerificationOverrideReason: overrideReason
      }
    });

    return {
      mode: this.getMode(),
      status: updatedAttempt.status,
      effectiveStatus: updatedAttempt.effectiveStatus,
      livenessConfidence: updatedAttempt.livenessConfidence,
      faceMatchSimilarity: updatedAttempt.faceMatchSimilarity,
      failureReason: updatedAttempt.failureReason,
      overrideReason: updatedAttempt.overrideReason,
      verified: updatedAttempt.effectiveStatus === FaceVerificationStatus.VERIFIED
    };
  }

  isRequired() {
    const configuredRequired = this.config.get<string>("FACE_VERIFICATION_REQUIRED")?.trim().toLowerCase();

    if (["true", "1", "yes", "required"].includes(configuredRequired ?? "")) {
      return true;
    }

    return this.getMode() === "enforce";
  }

  private async getProviderStatus(
    userId: string,
    livenessStatus: string | undefined,
    livenessConfidence: number | undefined,
    referenceImage: VerificationImage | undefined
  ) {
    const sourceImage = this.getReferenceImageInput(referenceImage);
    const referenceImageBucket = sourceImage.S3Object?.Bucket ?? null;
    const referenceImageKey = sourceImage.S3Object?.Name ?? null;

    if (livenessStatus !== "SUCCEEDED") {
      return {
        status: FaceVerificationStatus.FAILED,
        faceMatchSimilarity: null,
        matchedPhotoId: null,
        referenceImageBucket,
        referenceImageKey,
        failureReason: `Liveness check ${livenessStatus?.toLowerCase() ?? "failed"}.`
      };
    }

    const livenessThreshold = this.getNumberConfig("FACE_VERIFICATION_LIVENESS_THRESHOLD", DEFAULT_LIVENESS_THRESHOLD);

    if ((livenessConfidence ?? 0) < livenessThreshold) {
      return {
        status: FaceVerificationStatus.FAILED,
        faceMatchSimilarity: null,
        matchedPhotoId: null,
        referenceImageBucket,
        referenceImageKey,
        failureReason: "Liveness confidence was below the required threshold."
      };
    }

    const bestMatch = await this.findBestProfilePhotoMatch(userId, sourceImage);
    const matchThreshold = this.getNumberConfig("FACE_VERIFICATION_FACE_MATCH_THRESHOLD", DEFAULT_FACE_MATCH_THRESHOLD);

    if (bestMatch.similarity === null) {
      return {
        status: FaceVerificationStatus.REVIEW_REQUIRED,
        faceMatchSimilarity: null,
        matchedPhotoId: null,
        referenceImageBucket,
        referenceImageKey,
        failureReason: "No comparable face was found in the profile photos."
      };
    }

    if (bestMatch.similarity < matchThreshold) {
      return {
        status: FaceVerificationStatus.FAILED,
        faceMatchSimilarity: bestMatch.similarity,
        matchedPhotoId: bestMatch.photoId,
        referenceImageBucket,
        referenceImageKey,
        failureReason: "The live selfie did not match the profile photos closely enough."
      };
    }

    return {
      status: FaceVerificationStatus.VERIFIED,
      faceMatchSimilarity: bestMatch.similarity,
      matchedPhotoId: bestMatch.photoId,
      referenceImageBucket,
      referenceImageKey,
      failureReason: null
    };
  }

  private async findBestProfilePhotoMatch(userId: string, sourceImage: VerificationImage) {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        objectKey: true,
        cardObjectKey: true,
        fullObjectKey: true
      }
    });

    let bestSimilarity: number | null = null;
    let bestPhotoId: string | null = null;

    for (const photo of photos) {
      const objectKey = photo.fullObjectKey ?? photo.cardObjectKey ?? photo.objectKey;

      if (!objectKey) {
        continue;
      }

      const targetImageBytes = await this.storage.getObjectBuffer(objectKey);
      const response = await this.getClient().send(
        new CompareFacesCommand({
          SourceImage: sourceImage,
          TargetImage: { Bytes: targetImageBytes },
          SimilarityThreshold: 0
        })
      );
      const similarity = response.FaceMatches?.[0]?.Similarity ?? null;

      if (similarity !== null && (bestSimilarity === null || similarity > bestSimilarity)) {
        bestSimilarity = similarity;
        bestPhotoId = photo.id;
      }
    }

    return {
      similarity: bestSimilarity === null ? null : Math.round(bestSimilarity * 10) / 10,
      photoId: bestPhotoId
    };
  }

  private getReferenceImageInput(referenceImage: VerificationImage | undefined): VerificationImage {
    if (referenceImage?.S3Object?.Name) {
      return {
        S3Object: {
          Bucket: referenceImage.S3Object.Bucket ?? this.getVerificationBucket(),
          Name: referenceImage.S3Object.Name,
          Version: referenceImage.S3Object.Version
        }
      };
    }

    if (referenceImage?.Bytes) {
      return {
        Bytes: referenceImage.Bytes
      };
    }

    throw new BadGatewayException("Face verification result did not include a reference image.");
  }

  private getEffectiveStatus(providerStatus: FaceVerificationStatus) {
    if (this.getMode() === "prototype-pass") {
      return FaceVerificationStatus.VERIFIED;
    }

    return providerStatus;
  }

  private ensureEnabled() {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException("Face verification is not enabled.");
    }
  }

  private isEnabled() {
    return this.getMode() !== "off";
  }

  private getMode(): FaceVerificationMode {
    const mode = this.config.get<string>("FACE_VERIFICATION_MODE")?.trim().toLowerCase();

    if (mode === "observe" || mode === "prototype-pass" || mode === "enforce") {
      return mode;
    }

    return "off";
  }

  private getClient() {
    const accessKeyId = this.getOptionalConfig("AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID");
    const secretAccessKey = this.getOptionalConfig("AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY");

    return new RekognitionClient({
      region: this.getRegion(),
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey
            }
          : undefined
    });
  }

  private getRegion() {
    return this.getOptionalConfig("AWS_REKOGNITION_REGION", "AWS_REGION", "AWS_DEFAULT_REGION") ?? "eu-west-1";
  }

  private getVerificationBucket() {
    const bucket = this.getOptionalConfig("AWS_VERIFICATION_BUCKET", "FACE_VERIFICATION_BUCKET");

    if (!bucket) {
      throw new ServiceUnavailableException("Face verification bucket is not configured.");
    }

    return bucket;
  }

  private buildAuditImagePrefix(userId: string) {
    return `${this.getVerificationPrefix()}/${userId}/${Date.now()}`;
  }

  private getVerificationPrefix() {
    return this.normalizePrefix(this.getOptionalConfig("AWS_VERIFICATION_PREFIX", "FACE_VERIFICATION_PREFIX") ?? "face-liveness");
  }

  private normalizePrefix(value: string) {
    return value.trim().replace(/^\/+|\/+$/g, "") || "face-liveness";
  }

  private getOptionalConfig(...keys: string[]) {
    for (const key of keys) {
      const value = this.config.get<string>(key)?.trim();

      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private getNumberConfig(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key));

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
