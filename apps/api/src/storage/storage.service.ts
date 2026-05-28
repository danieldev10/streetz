import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type PhotoWithObjectKey = {
  url: string;
  objectKey?: string | null;
  thumbUrl?: string | null;
  thumbFallbackUrl?: string | null;
  thumbObjectKey?: string | null;
  cardUrl?: string | null;
  cardFallbackUrl?: string | null;
  cardObjectKey?: string | null;
  fullUrl?: string | null;
  fullFallbackUrl?: string | null;
  fullObjectKey?: string | null;
  fallbackUrl?: string | null;
};

@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  createUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number, contentLength?: number) {
    return getSignedUrl(
      this.createS3Client(),
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: objectKey,
        ContentType: contentType,
        ...(contentLength !== undefined ? { ContentLength: contentLength } : {})
      }),
      { expiresIn: expiresInSeconds }
    );
  }

  createReadUrl(objectKey: string, expiresInSeconds = 3600) {
    return getSignedUrl(
      this.createS3Client(),
      new GetObjectCommand({
        Bucket: this.getBucket(),
        Key: objectKey
      }),
      { expiresIn: expiresInSeconds }
    );
  }

  async getObjectBuffer(objectKey: string) {
    const response = await this.createS3Client().send(
      new GetObjectCommand({
        Bucket: this.getBucket(),
        Key: objectKey
      })
    );

    if (!response.Body) {
      throw new BadRequestException("Uploaded photo could not be read from storage.");
    }

    const bytes = await response.Body.transformToByteArray();

    return Buffer.from(bytes);
  }

  putObject(objectKey: string, body: Buffer, contentType: string, cacheControl = "public, max-age=31536000, immutable") {
    return this.createS3Client().send(
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl
      })
    );
  }

  deleteObject(objectKey: string) {
    return this.createS3Client().send(
      new DeleteObjectCommand({
        Bucket: this.getBucket(),
        Key: objectKey
      })
    );
  }

  async deleteObjects(objectKeys: Array<string | null | undefined>) {
    const keys = Array.from(new Set(objectKeys.filter((key): key is string => Boolean(key))));

    await Promise.all(keys.map((objectKey) => this.deleteObject(objectKey)));
  }

  buildPublicUrl(objectKey: string) {
    return `${this.getPublicBaseUrl()}/${this.encodeObjectKey(objectKey)}`;
  }

  isManagedPublicUrl(value: string, objectKeyPrefix?: string) {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(value);
    } catch {
      return false;
    }

    const publicBaseUrl = new URL(this.getPublicBaseUrl());
    const basePath = publicBaseUrl.pathname.replace(/\/+$/, "");
    const encodedPrefix = objectKeyPrefix ? `/${this.encodeObjectKey(objectKeyPrefix)}` : "";
    const expectedPathPrefix = `${basePath}${encodedPrefix}`;

    return parsedUrl.origin === publicBaseUrl.origin && parsedUrl.pathname.startsWith(expectedPathPrefix);
  }

  async signPhotoUrl<T extends PhotoWithObjectKey>(photo: T): Promise<T> {
    const thumbObjectKey = photo.thumbObjectKey ?? photo.cardObjectKey ?? photo.fullObjectKey ?? photo.objectKey;
    const cardObjectKey = photo.cardObjectKey ?? photo.fullObjectKey ?? photo.objectKey;
    const fullObjectKey = photo.fullObjectKey ?? photo.cardObjectKey ?? photo.objectKey;

    const [thumbUrl, cardUrl, fullUrl, originalUrl] = await Promise.all([
      this.createDeliveryUrl(thumbObjectKey, photo.thumbUrl),
      this.createDeliveryUrl(cardObjectKey, photo.cardUrl),
      this.createDeliveryUrl(fullObjectKey, photo.fullUrl),
      this.createDeliveryUrl(photo.objectKey, photo.url)
    ]);
    const [thumbFallbackUrl, cardFallbackUrl, fullFallbackUrl, originalFallbackUrl] = await Promise.all([
      this.createSignedFallbackUrl(thumbObjectKey, thumbUrl),
      this.createSignedFallbackUrl(cardObjectKey, cardUrl),
      this.createSignedFallbackUrl(fullObjectKey, fullUrl),
      this.createSignedFallbackUrl(photo.objectKey, originalUrl ?? photo.url)
    ]);

    return {
      ...photo,
      url: cardUrl ?? fullUrl ?? originalUrl ?? photo.url,
      thumbUrl,
      cardUrl,
      fullUrl,
      fallbackUrl: cardFallbackUrl ?? fullFallbackUrl ?? originalFallbackUrl ?? photo.url,
      thumbFallbackUrl,
      cardFallbackUrl,
      fullFallbackUrl
    };
  }

  signPhotoUrls<T extends PhotoWithObjectKey>(photos: T[]) {
    return Promise.all(photos.map((photo) => this.signPhotoUrl(photo)));
  }

  private createS3Client() {
    const region = this.getRegion();
    const accessKeyId = this.getOptionalConfig("AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID");
    const secretAccessKey = this.getOptionalConfig("AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY");
    const endpoint = this.getOptionalConfig("AWS_S3_ENDPOINT", "S3_ENDPOINT");

    return new S3Client({
      region,
      endpoint,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey
            }
          : undefined
    });
  }

  private getBucket() {
    const bucket = this.getOptionalConfig("AWS_S3_BUCKET", "AWS_S3_BUCKET_NAME", "S3_BUCKET", "S3_BUCKET_NAME");

    if (!bucket) {
      throw new BadRequestException("S3 bucket environment variable is not configured.");
    }

    return bucket;
  }

  private getRegion() {
    return this.getOptionalConfig("AWS_REGION", "AWS_DEFAULT_REGION", "S3_REGION") ?? "eu-north-1";
  }

  private getPublicBaseUrl() {
    const publicBaseUrl = this.getOptionalConfig(
      "MEDIA_CDN_BASE_URL",
      "CLOUDFRONT_BASE_URL",
      "AWS_CLOUDFRONT_URL",
      "S3_PUBLIC_BASE_URL",
      "AWS_S3_PUBLIC_BASE_URL"
    );

    if (publicBaseUrl) {
      return this.normalizeBaseUrl(publicBaseUrl);
    }

    return `https://${this.getBucket()}.s3.${this.getRegion()}.amazonaws.com`;
  }

  private async createDeliveryUrl(objectKey: string | null | undefined, fallbackUrl?: string | null) {
    if (!objectKey) {
      return fallbackUrl ?? null;
    }

    if (this.hasStableMediaBaseUrl()) {
      return this.buildPublicUrl(objectKey);
    }

    return this.createReadUrl(objectKey);
  }

  private async createSignedFallbackUrl(objectKey: string | null | undefined, fallbackUrl?: string | null) {
    if (!objectKey) {
      return fallbackUrl ?? null;
    }

    return this.createReadUrl(objectKey);
  }

  private hasStableMediaBaseUrl() {
    return Boolean(
      this.getOptionalConfig(
        "MEDIA_CDN_BASE_URL",
        "CLOUDFRONT_BASE_URL",
        "AWS_CLOUDFRONT_URL",
        "S3_PUBLIC_BASE_URL",
        "AWS_S3_PUBLIC_BASE_URL"
      )
    );
  }

  private encodeObjectKey(objectKey: string) {
    return objectKey.split("/").map(encodeURIComponent).join("/");
  }

  private normalizeBaseUrl(baseUrl: string) {
    const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

    if (/^https?:\/\//i.test(trimmedBaseUrl)) {
      return trimmedBaseUrl;
    }

    return `https://${trimmedBaseUrl}`;
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
}
