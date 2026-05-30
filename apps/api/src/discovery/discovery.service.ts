import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, ConnectionStatus, DiscoveryAction, MatchStatus, ReportStatus, SubscriptionStatus, UserRole } from "@prisma/client";
import { calculateAge } from "../common/age";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { getAccountAccessBlock } from "../users/account-status";
import { BlockUserDto } from "./dto/block-user.dto";
import { DiscoveryActionDto } from "./dto/discovery-action.dto";
import { ReportUserDto } from "./dto/report-user.dto";
import { UnblockUserDto } from "./dto/unblock-user.dto";

const DEFAULT_CANDIDATE_LIMIT = 12;
const CANDIDATE_POOL_LIMIT = DEFAULT_CANDIDATE_LIMIT * 5;
const EARTH_RADIUS_KM = 6371;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getCandidates(userId: string) {
    const currentProfile = await this.ensureCurrentProfileReady(userId);

    const now = new Date();
    const [actions, blocks, matches] = await Promise.all([
      this.prisma.discoveryActionLog.findMany({
        where: { actorId: userId },
        select: { targetId: true }
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [{ blockerId: userId }, { blockedId: userId }]
        },
        select: {
          blockerId: true,
          blockedId: true
        }
      }),
      this.prisma.match.findMany({
        where: {
          status: MatchStatus.ACTIVE,
          OR: [{ userAId: userId }, { userBId: userId }]
        },
        select: {
          userAId: true,
          userBId: true
        }
      })
    ]);

    const excludedIds = new Set<string>([userId]);

    for (const action of actions) {
      excludedIds.add(action.targetId);
    }

    for (const block of blocks) {
      excludedIds.add(block.blockerId === userId ? block.blockedId : block.blockerId);
    }

    for (const match of matches) {
      excludedIds.add(match.userAId === userId ? match.userBId : match.userAId);
    }

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: Array.from(excludedIds) },
        accountStatus: AccountStatus.ACTIVE,
        role: UserRole.USER,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionEndsAt: { gt: now },
        profile: {
          is: {
            bio: { not: null },
            birthDate: { not: null },
            city: { not: null },
            state: { not: null },
            connectionStatus: currentProfile.connectionStatus,
            discoveryLive: true,
            interests: { isEmpty: false }
          }
        },
        photos: { some: {} }
      },
      include: {
        profile: true,
        photos: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 6
        }
      },
      orderBy: { updatedAt: "desc" },
      take: currentProfile.latitude !== null && currentProfile.longitude !== null ? CANDIDATE_POOL_LIMIT : DEFAULT_CANDIDATE_LIMIT
    });

    const rankedCandidates = candidates
      .map((candidate) => ({
        candidate,
        distanceKm: this.calculateDistanceKm(currentProfile, candidate.profile)
      }))
      .filter(({ distanceKm }) => distanceKm === null || distanceKm <= currentProfile.maxDistanceKm)
      .sort((left, right) => {
        if (left.distanceKm !== null && right.distanceKm !== null) {
          return left.distanceKm - right.distanceKm;
        }

        if (left.distanceKm !== null) {
          return -1;
        }

        if (right.distanceKm !== null) {
          return 1;
        }

        return right.candidate.updatedAt.getTime() - left.candidate.updatedAt.getTime();
      })
      .slice(0, DEFAULT_CANDIDATE_LIMIT);

    return {
      candidates: await Promise.all(
        rankedCandidates.map(({ candidate, distanceKm }) => this.formatCandidate(candidate, { distanceKm }))
      ),
      location: {
        hasCoordinates: currentProfile.latitude !== null && currentProfile.longitude !== null,
        maxDistanceKm: currentProfile.maxDistanceKm,
        locationUpdatedAt: currentProfile.locationUpdatedAt
      }
    };
  }

  async recordAction(userId: string, dto: DiscoveryActionDto) {
    const currentProfile = await this.ensureCurrentProfileReady(userId);
    await this.ensureActionTarget(userId, dto.targetUserId, currentProfile.connectionStatus);

    const pair = this.getMatchPair(userId, dto.targetUserId);

    const action = await this.prisma.discoveryActionLog.upsert({
      where: {
        actorId_targetId: {
          actorId: userId,
          targetId: dto.targetUserId
        }
      },
      create: {
        actorId: userId,
        targetId: dto.targetUserId,
        action: dto.action
      },
      update: {
        action: dto.action,
        createdAt: new Date()
      }
    });

    if (dto.action === DiscoveryAction.PASS) {
      await this.prisma.match.updateMany({
        where: pair,
        data: { status: MatchStatus.UNMATCHED }
      });

      return {
        action,
        matched: false
      };
    }

    const reciprocalAction = await this.prisma.discoveryActionLog.findUnique({
      where: {
        actorId_targetId: {
          actorId: dto.targetUserId,
          targetId: userId
        }
      }
    });

    if (reciprocalAction?.action !== DiscoveryAction.LIKE) {
      return {
        action,
        matched: false
      };
    }

    const match = await this.prisma.match.upsert({
      where: {
        userAId_userBId: pair
      },
      create: {
        ...pair,
        status: MatchStatus.ACTIVE
      },
      update: {
        status: MatchStatus.ACTIVE
      },
      include: {
        userA: {
          include: {
            profile: true,
            photos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              take: 1
            }
          }
        },
        userB: {
          include: {
            profile: true,
            photos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              take: 1
            }
          }
        }
      }
    });

    return {
      action,
      matched: true,
      match: await this.formatMatch(match, userId)
    };
  }

  async getMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }],
        AND: [
          { userA: { accountStatus: { not: AccountStatus.DELETED } } },
          { userB: { accountStatus: { not: AccountStatus.DELETED } } }
        ]
      },
      include: {
        userA: {
          include: {
            profile: true,
            photos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              take: 1
            }
          }
        },
        userB: {
          include: {
            profile: true,
            photos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              take: 1
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      matches: await Promise.all(matches.map((match) => this.formatMatch(match, userId)))
    };
  }

  async getBlockedUsers(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          include: {
            profile: true,
            photos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              take: 1
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      blockedUsers: await Promise.all(
        blocks.map(async (block) => ({
          ...(await this.formatCandidate(block.blocked)),
          blockedAt: block.createdAt,
          blockReason: block.reason
        }))
      )
    };
  }

  async blockUser(userId: string, dto: BlockUserDto) {
    this.ensureDifferentUsers(userId, dto.targetUserId);
    await this.ensureUserExists(dto.targetUserId);

    const block = await this.prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: dto.targetUserId
        }
      },
      create: {
        blockerId: userId,
        blockedId: dto.targetUserId,
        reason: dto.reason?.trim() || null
      },
      update: {
        reason: dto.reason?.trim() || undefined
      }
    });

    await this.prisma.match.updateMany({
      where: {
        ...this.getMatchPair(userId, dto.targetUserId),
        status: MatchStatus.ACTIVE
      },
      data: { status: MatchStatus.BLOCKED }
    });

    return {
      blocked: true,
      block
    };
  }

  async unblockUser(userId: string, dto: UnblockUserDto) {
    this.ensureDifferentUsers(userId, dto.targetUserId);
    const pair = this.getMatchPair(userId, dto.targetUserId);

    const result = await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.userBlock.deleteMany({
        where: {
          blockerId: userId,
          blockedId: dto.targetUserId
        }
      });

      if (deleted.count === 0) {
        throw new NotFoundException("Blocked account not found.");
      }

      const reciprocalBlock = await transaction.userBlock.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: dto.targetUserId,
            blockedId: userId
          }
        },
        select: { id: true }
      });

      if (reciprocalBlock) {
        return { matchRestored: false };
      }

      const restored = await transaction.match.updateMany({
        where: {
          ...pair,
          status: MatchStatus.BLOCKED
        },
        data: { status: MatchStatus.ACTIVE }
      });

      return {
        matchRestored: restored.count > 0
      };
    });

    return {
      unblocked: true,
      ...result
    };
  }

  async reportUser(userId: string, dto: ReportUserDto) {
    this.ensureDifferentUsers(userId, dto.targetUserId);
    await this.ensureUserExists(dto.targetUserId);

    const existingOpenReport = await this.prisma.userReport.findFirst({
      where: {
        reporterId: userId,
        reportedId: dto.targetUserId,
        status: ReportStatus.OPEN
      }
    });

    if (existingOpenReport) {
      return {
        reported: true,
        report: existingOpenReport
      };
    }

    const report = await this.prisma.userReport.create({
      data: {
        reporterId: userId,
        reportedId: dto.targetUserId,
        reason: dto.reason.trim(),
        details: dto.details?.trim() || null
      }
    });

    return {
      reported: true,
      report
    };
  }

  private async ensureActionTarget(userId: string, targetUserId: string, connectionStatus: ConnectionStatus) {
    this.ensureDifferentUsers(userId, targetUserId);

    const target = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        accountStatus: AccountStatus.ACTIVE,
        role: UserRole.USER,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionEndsAt: { gt: new Date() },
        profile: {
          is: {
            bio: { not: null },
            birthDate: { not: null },
            city: { not: null },
            state: { not: null },
            connectionStatus,
            discoveryLive: true,
            interests: { isEmpty: false }
          }
        },
        photos: { some: {} }
      },
      select: { id: true }
    });

    if (!target) {
      throw new NotFoundException("Discovery profile not found.");
    }

    const existingBlock = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: userId }
        ]
      },
      select: { id: true }
    });

    if (existingBlock) {
      throw new ForbiddenException("This profile is no longer available.");
    }
  }

  private async ensureCurrentProfileReady(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountStatus: true,
        suspendedUntil: true,
        profile: {
          select: {
            bio: true,
            birthDate: true,
            connectionStatus: true,
            city: true,
            state: true,
            latitude: true,
            longitude: true,
            locationUpdatedAt: true,
            maxDistanceKm: true,
            interests: true
          }
        },
        photos: {
          select: { id: true },
          take: 1
        }
      }
    });

    if (user) {
      const accountBlock = getAccountAccessBlock(user);

      if (accountBlock) {
        throw new ForbiddenException(accountBlock);
      }
    }

    const profile = user?.profile;
    const connectionStatus = profile?.connectionStatus;
    const isReady =
      Boolean(profile?.bio?.trim()) &&
      Boolean(profile?.birthDate) &&
      Boolean(connectionStatus) &&
      Boolean(profile?.city?.trim()) &&
      Boolean(profile?.state?.trim()) &&
      Boolean(profile?.interests.length) &&
      Boolean(user?.photos.length);

    if (!profile || !isReady || !connectionStatus) {
      throw new ForbiddenException("Complete your profile setup before using discovery.");
    }

    return {
      connectionStatus,
      latitude: profile.latitude,
      longitude: profile.longitude,
      locationUpdatedAt: profile.locationUpdatedAt,
      maxDistanceKm: profile.maxDistanceKm
    };
  }

  private ensureDifferentUsers(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("You cannot perform this action on your own profile.");
    }
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountStatus: true }
    });

    if (!user || user.accountStatus === AccountStatus.DELETED) {
      throw new NotFoundException("User not found.");
    }
  }

  private getMatchPair(userId: string, targetUserId: string) {
    const [userAId, userBId] = [userId, targetUserId].sort();

    return {
      userAId,
      userBId
    };
  }

  private calculateDistanceKm(
    origin: { latitude: number | null; longitude: number | null },
    target: { latitude?: number | null; longitude?: number | null } | null
  ) {
    if (
      origin.latitude === null ||
      origin.longitude === null ||
      target?.latitude === null ||
      target?.latitude === undefined ||
      target.longitude === null ||
      target.longitude === undefined
    ) {
      return null;
    }

    const latDistance = this.degreesToRadians(target.latitude - origin.latitude);
    const lonDistance = this.degreesToRadians(target.longitude - origin.longitude);
    const originLat = this.degreesToRadians(origin.latitude);
    const targetLat = this.degreesToRadians(target.latitude);

    const haversine =
      Math.sin(latDistance / 2) * Math.sin(latDistance / 2) +
      Math.cos(originLat) * Math.cos(targetLat) * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);

    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  private degreesToRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private async formatCandidate(candidate: {
    id: string;
    displayName: string;
    accountStatus?: AccountStatus;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      connectionStatus: ConnectionStatus | null;
      city: string | null;
      state: string | null;
      latitude?: number | null;
      longitude?: number | null;
      interests: string[];
    } | null;
    photos: Array<{
      id: string;
      url: string;
      objectKey?: string | null;
      thumbUrl?: string | null;
      thumbObjectKey?: string | null;
      cardUrl?: string | null;
      cardObjectKey?: string | null;
      fullUrl?: string | null;
      fullObjectKey?: string | null;
      sortOrder: number;
    }>;
  }, options: { distanceKm?: number | null } = {}) {
    return {
      id: candidate.id,
      displayName: candidate.displayName,
      accountStatus: candidate.accountStatus ?? AccountStatus.ACTIVE,
      age: candidate.profile?.birthDate ? calculateAge(candidate.profile.birthDate) : null,
      bio: candidate.profile?.bio ?? null,
      connectionStatus: candidate.profile?.connectionStatus ?? null,
      city: candidate.profile?.city ?? null,
      state: candidate.profile?.state ?? null,
      distanceKm: options.distanceKm === null || options.distanceKm === undefined ? null : Math.round(options.distanceKm * 10) / 10,
      interests: candidate.profile?.interests ?? [],
      photos: await this.storage.signPhotoUrls(candidate.photos)
    };
  }

  private async formatMatch(
    match: {
      id: string;
      createdAt: Date;
      userAId: string;
      userA: Parameters<DiscoveryService["formatCandidate"]>[0];
      userB: Parameters<DiscoveryService["formatCandidate"]>[0];
    },
    currentUserId: string
  ) {
    const otherUser = match.userAId === currentUserId ? match.userB : match.userA;

    return {
      id: match.id,
      createdAt: match.createdAt,
      user: await this.formatCandidate(otherUser)
    };
  }

}
