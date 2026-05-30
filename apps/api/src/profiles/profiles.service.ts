import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import sharp = require("sharp");
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PROFILE_PHOTO_UPLOAD_MAX_BYTES, formatUploadLimit } from "../storage/upload-limits";
import { CreateProfilePhotoDto } from "./dto/create-profile-photo.dto";
import { PresignProfilePhotoDto } from "./dto/presign-profile-photo.dto";
import { ReverseGeocodeDto } from "./dto/reverse-geocode.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

const MAX_PROFILE_PHOTOS = 4;
const PHOTO_UPLOAD_EXPIRES_SECONDS = 300;
const DEFAULT_MAX_DISTANCE_KM = 50;
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

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

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GoogleReverseGeocodeResponse = {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address?: string;
    address_components: GoogleAddressComponent[];
  }>;
};

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService
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
      connectionStatus: null,
      city: null,
      state: null,
      latitude: null,
      longitude: null,
      locationAccuracyMeters: null,
      locationUpdatedAt: null,
      maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
      interests: [],
      discoveryLive: true,
      createdAt: null,
      updatedAt: null,
      user
    });
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const birthDate = dto.birthDate ? this.parseAdultBirthDate(dto.birthDate) : undefined;
    const interests = dto.interests ? this.cleanInterests(dto.interests) : undefined;
    const locationUpdate = this.getLocationUpdate(dto);
    const maxDistanceKm = this.cleanMaxDistance(dto.maxDistanceKm);

    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        bio: this.cleanNullableText(dto.bio),
        birthDate,
        gender: dto.gender,
        connectionStatus: dto.connectionStatus,
        city: this.cleanNullableText(dto.city),
        state: this.cleanNullableText(dto.state),
        ...locationUpdate,
        ...(maxDistanceKm === undefined ? {} : { maxDistanceKm }),
        interests: interests ?? [],
        discoveryLive: true
      },
      update: {
        bio: dto.bio === undefined ? undefined : this.cleanNullableText(dto.bio),
        birthDate,
        gender: dto.gender,
        connectionStatus: dto.connectionStatus,
        city: dto.city === undefined ? undefined : this.cleanNullableText(dto.city),
        state: dto.state === undefined ? undefined : this.cleanNullableText(dto.state),
        ...locationUpdate,
        ...(maxDistanceKm === undefined ? {} : { maxDistanceKm }),
        interests,
        discoveryLive: true
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

  async reverseGeocodeLocation(dto: ReverseGeocodeDto) {
    const apiKey = this.config.get<string>("GOOGLE_MAPS_API_KEY")?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException("Location lookup is not configured.");
    }

    const url = new URL(GOOGLE_GEOCODING_URL);
    url.searchParams.set("latlng", `${dto.latitude},${dto.longitude}`);
    url.searchParams.set("language", "en");
    url.searchParams.set("region", "ng");
    url.searchParams.set("key", apiKey);

    let response: Response;

    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new BadGatewayException("Could not look up this location right now.");
    }

    if (!response.ok) {
      throw new BadGatewayException(`Google location lookup failed with HTTP ${response.status}.`);
    }

    const body = (await response.json()) as GoogleReverseGeocodeResponse;

    if (body.status === "ZERO_RESULTS") {
      return {
        state: null,
        city: null,
        stateCandidates: [],
        cityCandidates: [],
        formattedAddress: null
      };
    }

    if (body.status !== "OK") {
      throw new BadGatewayException(this.getGoogleGeocodingError(body.status, body.error_message));
    }

    const components = body.results.flatMap((result) => result.address_components);
    const stateCandidates = this.getUniqueLocationNames(
      components.filter((component) => component.types.includes("administrative_area_level_1"))
    ).map((state) => state.replace(/\s+State$/i, ""));
    const cityCandidates = this.getUniqueLocationNames(
      components.filter((component) =>
        component.types.some((type) =>
          [
            "sublocality_level_1",
            "sublocality",
            "locality",
            "postal_town",
            "administrative_area_level_2",
            "neighborhood"
          ].includes(type)
        )
      )
    );

    return {
      state: stateCandidates[0] ?? null,
      city: cityCandidates[0] ?? null,
      stateCandidates,
      cityCandidates,
      formattedAddress: body.results[0]?.formatted_address ?? null
    };
  }

  async createPhotoUpload(userId: string, dto: PresignProfilePhotoDto) {
    const extension = contentTypeExtensions[dto.contentType];

    if (!extension) {
      throw new BadRequestException("Only JPG, PNG, and WebP profile photos are supported.");
    }

    if (dto.fileSizeBytes > PROFILE_PHOTO_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(`Profile photos must be ${formatUploadLimit(PROFILE_PHOTO_UPLOAD_MAX_BYTES)} or smaller after compression.`);
    }

    const objectKey = `profiles/${userId}/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
    return {
      uploadUrl: await this.storage.createUploadUrl(objectKey, dto.contentType, PHOTO_UPLOAD_EXPIRES_SECONDS, dto.fileSizeBytes),
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

  private getLocationUpdate(dto: UpdateProfileDto) {
    const { latitude, longitude } = dto;

    if (latitude === undefined && longitude === undefined) {
      return {};
    }

    if (latitude === undefined || longitude === undefined) {
      throw new BadRequestException("Latitude and longitude must be saved together.");
    }

    return {
      latitude,
      longitude,
      locationAccuracyMeters: dto.locationAccuracyMeters ?? null,
      locationUpdatedAt: new Date()
    };
  }

  private cleanMaxDistance(value: number | undefined) {
    if (value === undefined) {
      return undefined;
    }

    if (!Number.isInteger(value) || value < 1 || value > 500) {
      throw new BadRequestException("Max distance must be between 1km and 500km.");
    }

    return value;
  }

  private getUniqueLocationNames(components: GoogleAddressComponent[]) {
    const names = new Set<string>();

    for (const component of components) {
      const name = component.long_name.trim();

      if (name) {
        names.add(name);
      }
    }

    return [...names];
  }

  private getGoogleGeocodingError(status: string, errorMessage?: string) {
    const safeMessage = errorMessage?.replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]");

    if (status === "REQUEST_DENIED") {
      return safeMessage
        ? `Google location lookup was denied: ${safeMessage}`
        : "Google location lookup was denied. Check the Geocoding API, billing, and API key restrictions.";
    }

    if (status === "OVER_QUERY_LIMIT") {
      return "Google location lookup quota has been reached.";
    }

    if (status === "INVALID_REQUEST") {
      return "Google location lookup received invalid coordinates.";
    }

    return safeMessage ? `Google location lookup failed: ${safeMessage}` : "Could not look up this location right now.";
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
      throw new BadRequestException("crushclub discovery is only available to users who are at least 18.");
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
