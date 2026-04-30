import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import sharp = require("sharp");
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CreateProfilePhotoDto } from "./dto/create-profile-photo.dto";
import { PresignProfilePhotoDto } from "./dto/presign-profile-photo.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

const MAX_PROFILE_PHOTOS = 6;
const PHOTO_UPLOAD_EXPIRES_SECONDS = 300;

const contentTypeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const profilePhotoVariants = [
  { name: "thumb", width: 160, quality: 76 },
  { name: "card", width: 800, quality: 82 },
  { name: "full", width: 1400, quality: 84 }
] as const;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            photos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
            }
          }
        }
      }
    });

    if (profile) {
      return this.withSignedProfilePhotos(profile);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        photos: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    return this.withSignedProfilePhotos({
      id: "",
      userId,
      bio: null,
      birthDate: null,
      gender: null,
      city: null,
      state: null,
      interests: [],
      discoveryLive: false,
      createdAt: null,
      updatedAt: null,
      user
    });
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const birthDate = dto.birthDate ? this.parseAdultBirthDate(dto.birthDate) : undefined;
    const interests = dto.interests ? this.cleanInterests(dto.interests) : undefined;

    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        bio: this.cleanNullableText(dto.bio),
        birthDate,
        gender: dto.gender,
        city: this.cleanNullableText(dto.city),
        state: this.cleanNullableText(dto.state),
        interests: interests ?? [],
        discoveryLive: dto.discoveryLive ?? false
      },
      update: {
        bio: dto.bio === undefined ? undefined : this.cleanNullableText(dto.bio),
        birthDate,
        gender: dto.gender,
        city: dto.city === undefined ? undefined : this.cleanNullableText(dto.city),
        state: dto.state === undefined ? undefined : this.cleanNullableText(dto.state),
        interests,
        discoveryLive: dto.discoveryLive
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            photos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
            }
          }
        }
      }
    });

    return this.withSignedProfilePhotos(profile);
  }

  async createPhotoUpload(userId: string, dto: PresignProfilePhotoDto) {
    const extension = contentTypeExtensions[dto.contentType];

    if (!extension) {
      throw new BadRequestException("Only JPG, PNG, and WebP profile photos are supported.");
    }

    const objectKey = `profiles/${userId}/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
    return {
      uploadUrl: await this.storage.createUploadUrl(objectKey, dto.contentType, PHOTO_UPLOAD_EXPIRES_SECONDS),
      objectKey,
      publicUrl: this.storage.buildPublicUrl(objectKey),
      expiresInSeconds: PHOTO_UPLOAD_EXPIRES_SECONDS
    };
  }

  async registerPhoto(userId: string, dto: CreateProfilePhotoDto) {
    this.ensureOwnObjectKey(userId, dto.objectKey);

    const photoCount = await this.prisma.profilePhoto.count({
      where: { userId }
    });

    if (photoCount >= MAX_PROFILE_PHOTOS) {
      throw new BadRequestException(`You can add up to ${MAX_PROFILE_PHOTOS} profile photos.`);
    }

    const variants = await this.createOptimizedPhotoVariants(dto.objectKey);

    const photo = await this.prisma.profilePhoto.create({
      data: {
        userId,
        objectKey: dto.objectKey,
        url: this.storage.buildPublicUrl(dto.objectKey),
        thumbObjectKey: variants.thumbObjectKey,
        thumbUrl: variants.thumbUrl,
        cardObjectKey: variants.cardObjectKey,
        cardUrl: variants.cardUrl,
        fullObjectKey: variants.fullObjectKey,
        fullUrl: variants.fullUrl,
        blurDataUrl: variants.blurDataUrl,
        sortOrder: dto.sortOrder ?? photoCount
      }
    });

    return this.storage.signPhotoUrl(photo);
  }

  async deletePhoto(userId: string, photoId: string) {
    const photo = await this.prisma.profilePhoto.findUnique({
      where: { id: photoId }
    });

    if (!photo) {
      throw new NotFoundException("Profile photo not found.");
    }

    if (photo.userId !== userId) {
      throw new ForbiddenException("You can only delete your own profile photos.");
    }

    await this.prisma.profilePhoto.delete({
      where: { id: photoId }
    });

    await this.storage.deleteObjects([
      photo.objectKey,
      photo.thumbObjectKey,
      photo.cardObjectKey,
      photo.fullObjectKey
    ]);

    return { deleted: true };
  }

  async backfillMissingPhotoVariants(limit = 50) {
    const photos = await this.prisma.profilePhoto.findMany({
      where: {
        objectKey: { not: null },
        OR: [{ thumbObjectKey: null }, { cardObjectKey: null }, { fullObjectKey: null }, { blurDataUrl: null }]
      },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, Math.min(limit, 200))
    });
    const result = {
      checked: photos.length,
      optimized: 0,
      failed: 0,
      failures: [] as Array<{ photoId: string; reason: string }>
    };

    for (const photo of photos) {
      if (!photo.objectKey) {
        continue;
      }

      try {
        const variants = await this.createOptimizedPhotoVariants(photo.objectKey);

        await this.prisma.profilePhoto.update({
          where: { id: photo.id },
          data: variants
        });

        result.optimized += 1;
      } catch (error) {
        result.failed += 1;
        result.failures.push({
          photoId: photo.id,
          reason: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return result;
  }

  private cleanNullableText(value: string | undefined) {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private cleanInterests(interests: string[]) {
    return Array.from(new Set(interests.map((interest) => interest.trim()).filter(Boolean))).slice(0, 12);
  }

  private parseAdultBirthDate(value: string) {
    const birthDate = new Date(value);

    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      throw new BadRequestException("Enter a valid birth date.");
    }

    const eighteenthBirthday = new Date(birthDate);
    eighteenthBirthday.setFullYear(eighteenthBirthday.getFullYear() + 18);

    if (eighteenthBirthday > new Date()) {
      throw new BadRequestException("Streetz discovery is only available to users who are at least 18.");
    }

    return birthDate;
  }

  private ensureOwnObjectKey(userId: string, objectKey: string) {
    if (!objectKey.startsWith(`profiles/${userId}/`)) {
      throw new ForbiddenException("Photo object key does not belong to this user.");
    }
  }

  private async createOptimizedPhotoVariants(objectKey: string) {
    const originalBuffer = await this.storage.getObjectBuffer(objectKey);
    const baseObjectKey = this.getVariantBaseObjectKey(objectKey);

    const [thumb, card, full, blurDataUrl] = await Promise.all([
      this.createProfilePhotoVariant(originalBuffer, baseObjectKey, "thumb"),
      this.createProfilePhotoVariant(originalBuffer, baseObjectKey, "card"),
      this.createProfilePhotoVariant(originalBuffer, baseObjectKey, "full"),
      this.createBlurDataUrl(originalBuffer)
    ]);

    return {
      thumbObjectKey: thumb.objectKey,
      thumbUrl: thumb.url,
      cardObjectKey: card.objectKey,
      cardUrl: card.url,
      fullObjectKey: full.objectKey,
      fullUrl: full.url,
      blurDataUrl
    };
  }

  private async createProfilePhotoVariant(
    originalBuffer: Buffer,
    baseObjectKey: string,
    variantName: (typeof profilePhotoVariants)[number]["name"]
  ) {
    const variant = profilePhotoVariants.find((candidate) => candidate.name === variantName);

    if (!variant) {
      throw new BadRequestException("Unknown profile photo variant.");
    }

    const objectKey = `${baseObjectKey}/${variant.name}.webp`;
    const body = await sharp(originalBuffer, { failOn: "none" })
      .rotate()
      .resize({ width: variant.width, withoutEnlargement: true })
      .webp({ quality: variant.quality, effort: 4 })
      .toBuffer();

    await this.storage.putObject(objectKey, body, "image/webp");

    return {
      objectKey,
      url: this.storage.buildPublicUrl(objectKey)
    };
  }

  private async createBlurDataUrl(originalBuffer: Buffer) {
    const blurBuffer = await sharp(originalBuffer, { failOn: "none" })
      .rotate()
      .resize({ width: 24, withoutEnlargement: true })
      .webp({ quality: 42, effort: 3 })
      .toBuffer();

    return `data:image/webp;base64,${blurBuffer.toString("base64")}`;
  }

  private getVariantBaseObjectKey(objectKey: string) {
    const lastSlashIndex = objectKey.lastIndexOf("/");
    const lastDotIndex = objectKey.lastIndexOf(".");

    if (lastDotIndex > lastSlashIndex) {
      return objectKey.slice(0, lastDotIndex);
    }

    return objectKey;
  }

  private async withSignedProfilePhotos<
    T extends {
      user: {
        photos: Array<{
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
        }>;
      };
    }
  >(profile: T): Promise<T> {
    return {
      ...profile,
      user: {
        ...profile.user,
        photos: await this.storage.signPhotoUrls(profile.user.photos)
      }
    };
  }
}
