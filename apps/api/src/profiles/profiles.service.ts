import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
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

    const photo = await this.prisma.profilePhoto.create({
      data: {
        userId,
        objectKey: dto.objectKey,
        url: this.storage.buildPublicUrl(dto.objectKey),
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

    if (photo.objectKey) {
      await this.storage.deleteObject(photo.objectKey);
    }

    return { deleted: true };
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

  private async withSignedProfilePhotos<
    T extends {
      user: {
        photos: Array<{
          url: string;
          objectKey?: string | null;
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
