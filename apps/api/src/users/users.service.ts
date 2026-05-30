import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AccountStatus, ModerationActionType, SubscriptionStatus, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

type CreateUserInput = {
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
};

type AccountActionOptions = {
  adminId?: string | null;
  reportId?: string | null;
  reason?: string | null;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id }
    });
  }

  async create(input: CreateUserInput) {
    const email = input.email.toLowerCase();
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException("An account with this email already exists.");
    }

    return this.prisma.user.create({
      data: {
        email,
        displayName: input.displayName,
        passwordHash: await hash(input.password, 12),
        role: input.role ?? UserRole.USER
      }
    });
  }

  async deactivateAccount(userId: string) {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    if (user.accountStatus === AccountStatus.DELETED) {
      throw new ForbiddenException("Deleted accounts cannot be deactivated.");
    }

    if (user.accountStatus === AccountStatus.BANNED) {
      throw new ForbiddenException("This account is locked.");
    }

    if (user.accountStatus === AccountStatus.SUSPENDED && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new ForbiddenException("This account is temporarily suspended.");
    }

    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      await transaction.profile.updateMany({
        where: { userId },
        data: { discoveryLive: false }
      });

      const updatedUser = await transaction.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountStatus.DEACTIVATED,
          deactivatedAt: now,
          suspendedUntil: null,
          moderationReason: null
        }
      });

      await transaction.moderationAction.create({
        data: {
          targetUserId: userId,
          action: ModerationActionType.DEACTIVATE
        }
      });

      return updatedUser;
    });
  }

  async reactivateAccount(userId: string) {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    if (user.accountStatus === AccountStatus.DELETED) {
      throw new ForbiddenException("Deleted accounts cannot be reactivated.");
    }

    if (user.accountStatus === AccountStatus.BANNED) {
      throw new ForbiddenException("This account is locked.");
    }

    if (user.accountStatus === AccountStatus.SUSPENDED && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new ForbiddenException("This account is temporarily suspended.");
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.profile.updateMany({
        where: { userId },
        data: { discoveryLive: true }
      });

      const updatedUser = await transaction.user.update({
        where: { id: userId },
        data: {
          accountStatus: AccountStatus.ACTIVE,
          suspendedUntil: null,
          deactivatedAt: null,
          moderationReason: null
        }
      });

      await transaction.moderationAction.create({
        data: {
          targetUserId: userId,
          action: ModerationActionType.REACTIVATE
        }
      });

      return updatedUser;
    });
  }

  async softDeleteAccount(userId: string, options: AccountActionOptions = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        photos: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const objectKeys = user.photos.flatMap((photo) => [
      photo.objectKey,
      photo.thumbObjectKey,
      photo.cardObjectKey,
      photo.fullObjectKey
    ]);

    if (objectKeys.some(Boolean)) {
      try {
        await this.storage.deleteObjects(objectKeys);
      } catch (error) {
        this.logger.warn(`Could not delete all profile photos for soft-deleted user ${userId}: ${String(error)}`);
      }
    }

    const now = new Date();
    const reason = this.cleanOptionalText(options.reason);
    const deletedEmail = `deleted-${userId}@deleted.crushclub.local`;
    const deletedPasswordHash = await hash(randomBytes(32).toString("hex"), 12);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.profilePhoto.deleteMany({
        where: { userId }
      });

      await transaction.profile.updateMany({
        where: { userId },
        data: {
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
          interests: [],
          discoveryLive: false
        }
      });

      const updatedUser = await transaction.user.update({
        where: { id: userId },
        data: {
          email: deletedEmail,
          displayName: "Deleted member",
          passwordHash: deletedPasswordHash,
          subscriptionStatus: SubscriptionStatus.CANCELLED,
          subscriptionEndsAt: null,
          accountStatus: AccountStatus.DELETED,
          suspendedUntil: null,
          deactivatedAt: null,
          deletedAt: now,
          moderationReason: reason
        }
      });

      await transaction.moderationAction.create({
        data: {
          adminId: options.adminId ?? null,
          targetUserId: userId,
          reportId: options.reportId ?? null,
          action: ModerationActionType.DELETE,
          reason
        }
      });

      return updatedUser;
    });
  }

  private cleanOptionalText(value: string | null | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
  }
}
