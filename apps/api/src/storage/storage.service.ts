import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type PhotoWithObjectKey = {
  url: string;
  objectKey?: string | null;
};

@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  createUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number) {
    return getSignedUrl(
      this.createS3Client(),
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: objectKey,
        ContentType: contentType
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

  deleteObject(objectKey: string) {
    return this.createS3Client().send(
      new DeleteObjectCommand({
        Bucket: this.getBucket(),
        Key: objectKey
      })
    );
  }

  buildPublicUrl(objectKey: string) {
    const publicBaseUrl = this.getOptionalConfig("S3_PUBLIC_BASE_URL", "AWS_S3_PUBLIC_BASE_URL");

    if (publicBaseUrl) {
      return `${publicBaseUrl.replace(/\/$/, "")}/${this.encodeObjectKey(objectKey)}`;
    }

    return `https://${this.getBucket()}.s3.${this.getRegion()}.amazonaws.com/${this.encodeObjectKey(objectKey)}`;
  }

  async signPhotoUrl<T extends PhotoWithObjectKey>(photo: T): Promise<T> {
    if (!photo.objectKey) {
      return photo;
    }

    return {
      ...photo,
      url: await this.createReadUrl(photo.objectKey)
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

  private encodeObjectKey(objectKey: string) {
    return objectKey.split("/").map(encodeURIComponent).join("/");
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
