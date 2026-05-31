import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, ConnectionStatus, DiscoveryAction, Gender, MatchStatus, Prisma, ReportStatus, Sexuality, SubscriptionStatus, UserRole } from "@prisma/client";
import { calculateAge } from "../common/age";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { getAccountAccessBlock } from "../users/account-status";
import { BlockUserDto } from "./dto/block-user.dto";
import { DiscoveryActionDto } from "./dto/discovery-action.dto";
import { DiscoveryFiltersDto } from "./dto/discovery-filters.dto";
import { ReportUserDto } from "./dto/report-user.dto";
import { UnblockUserDto } from "./dto/unblock-user.dto";

const DEFAULT_CANDIDATE_LIMIT = 12;

type ReadyDiscoveryProfile = {
  connectionStatus: ConnectionStatus;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: Date | null;
  maxDistanceKm: number;
};

type SpatialCandidateRow = {
  id: string;
  distanceKm: number;
};

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getCandidates(userId: string, filters: DiscoveryFiltersDto = {}) {
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

    const candidateInclude = {
      profile: true,
      photos: {
        orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
        take: 6
      }
    };

    if (currentProfile.latitude !== null && currentProfile.longitude !== null) {
      const nearbyRows = await this.getNearbyCandidateRows(currentProfile, excludedIds, now, filters);
      const nearbyCandidateIds = nearbyRows.map((row) => row.id);
      const candidates =
        nearbyCandidateIds.length > 0
          ? await this.prisma.user.findMany({
              where: { id: { in: nearbyCandidateIds } },
              include: candidateInclude
            })
          : [];
      const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

      return {
        candidates: await Promise.all(
          nearbyRows
            .map((row) => {
              const candidate = candidatesById.get(row.id);

              return candidate ? { candidate, distanceKm: row.distanceKm } : null;
            })
            .filter((row): row is { candidate: (typeof candidates)[number]; distanceKm: number } => Boolean(row))
            .map(({ candidate, distanceKm }) => this.formatCandidate(candidate, { distanceKm }))
        ),
        location: this.formatLocationMeta(currentProfile)
      };
    }

    const profileWhere: Prisma.ProfileWhereInput = {
      bio: { not: null },
      birthDate: {
        not: null,
        ...(filters.minAge !== undefined ? { lte: new Date(now.getFullYear() - filters.minAge, now.getMonth(), now.getDate()) } : {}),
        ...(filters.maxAge !== undefined ? { gt: new Date(now.getFullYear() - (filters.maxAge + 1), now.getMonth(), now.getDate()) } : {})
      },
      city: { not: null },
      state: { not: null },
      discoveryLive: true,
      interests: { isEmpty: false },
      ...(filters.gender?.length ? { gender: { in: filters.gender } } : {}),
      ...(filters.sexuality?.length ? { sexuality: { in: filters.sexuality } } : {}),
      ...(filters.lookingFor?.length ? { connectionStatus: { in: filters.lookingFor } } : {})
    };

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: Array.from(excludedIds) },
        accountStatus: AccountStatus.ACTIVE,
        role: UserRole.USER,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionEndsAt: { gt: now },
        profile: { is: profileWhere },
        photos: { some: {} }
      },
      include: candidateInclude,
      orderBy: { updatedAt: "desc" },
      take: DEFAULT_CANDIDATE_LIMIT
    });

    return {
      candidates: await Promise.all(candidates.map((candidate) => this.formatCandidate(candidate))),
      location: this.formatLocationMeta(currentProfile)
    };
  }

  async recordAction(userId: string, dto: DiscoveryActionDto) {
    await this.ensureCurrentProfileReady(userId);
    await this.ensureActionTarget(userId, dto.targetUserId);

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

  private async ensureActionTarget(userId: string, targetUserId: string) {
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
      city: profile.city,
      state: profile.state,
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

  private formatLocationMeta(profile: ReadyDiscoveryProfile) {
    return {
      hasCoordinates: profile.latitude !== null && profile.longitude !== null,
      city: profile.city,
      state: profile.state,
      maxDistanceKm: profile.maxDistanceKm,
      locationUpdatedAt: profile.locationUpdatedAt
    };
  }

  private async getNearbyCandidateRows(profile: ReadyDiscoveryProfile, excludedIds: Set<string>, now: Date, filters: DiscoveryFiltersDto = {}) {
    if (profile.latitude === null || profile.longitude === null) {
      return [];
    }

    const hasDistanceLimit = profile.maxDistanceKm > 0;
    const maxDistanceMeters = profile.maxDistanceKm * 1000;
    const excludedIdList = Array.from(excludedIds);
    const filterClauses: Prisma.Sql[] = [];

    if (filters.minAge !== undefined) {
      const cutoff = new Date(now.getFullYear() - filters.minAge, now.getMonth(), now.getDate());
      filterClauses.push(Prisma.sql`AND candidate_profile."birthDate" <= ${cutoff}`);
    }

    if (filters.maxAge !== undefined) {
      const cutoff = new Date(now.getFullYear() - (filters.maxAge + 1), now.getMonth(), now.getDate());
      filterClauses.push(Prisma.sql`AND candidate_profile."birthDate" > ${cutoff}`);
    }

    if (filters.gender?.length) {
      filterClauses.push(Prisma.sql`AND candidate_profile."gender" = ANY(ARRAY[${Prisma.join(filters.gender)}]::"Gender"[])`);
    }

    if (filters.sexuality?.length) {
      filterClauses.push(Prisma.sql`AND candidate_profile."sexuality" = ANY(ARRAY[${Prisma.join(filters.sexuality)}]::"Sexuality"[])`);
    }

    if (filters.lookingFor?.length) {
      filterClauses.push(Prisma.sql`AND candidate_profile."connectionStatus" = ANY(ARRAY[${Prisma.join(filters.lookingFor)}]::"ConnectionStatus"[])`);
    }

    const filterSql = filterClauses.length > 0 ? Prisma.join(filterClauses, "\n        ") : Prisma.sql``;

    return this.prisma.$transaction(async (transaction) => {
      // Supabase installs PostGIS in "extensions"; local databases may use "public".
      await transaction.$executeRaw`SET LOCAL search_path = public, extensions`;

      return transaction.$queryRaw<SpatialCandidateRow[]>(Prisma.sql`
        WITH origin AS (
          SELECT ST_SetSRID(ST_MakePoint(${profile.longitude}, ${profile.latitude}), 4326)::geography AS geog
        )
        SELECT
          candidate."id",
          (ST_Distance(candidate_profile."location", origin.geog) / 1000.0)::double precision AS "distanceKm"
        FROM origin
        JOIN "User" AS candidate ON TRUE
        JOIN "Profile" AS candidate_profile ON candidate_profile."userId" = candidate."id"
        WHERE candidate."id" NOT IN (${Prisma.join(excludedIdList)})
          AND candidate."accountStatus" = CAST(${AccountStatus.ACTIVE} AS "AccountStatus")
          AND candidate."role" = CAST(${UserRole.USER} AS "UserRole")
          AND candidate."subscriptionStatus" = CAST(${SubscriptionStatus.ACTIVE} AS "SubscriptionStatus")
          AND candidate."subscriptionEndsAt" > ${now}
          AND candidate_profile."bio" IS NOT NULL
          AND candidate_profile."birthDate" IS NOT NULL
          AND candidate_profile."city" IS NOT NULL
          AND candidate_profile."state" IS NOT NULL
          AND candidate_profile."discoveryLive" = TRUE
          AND cardinality(candidate_profile."interests") > 0
          AND candidate_profile."location" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "ProfilePhoto" AS photo
            WHERE photo."userId" = candidate."id"
          )
          ${hasDistanceLimit ? Prisma.sql`AND ST_DWithin(candidate_profile."location", origin.geog, ${maxDistanceMeters})` : Prisma.sql``}
          ${filterSql}
        ORDER BY ST_Distance(candidate_profile."location", origin.geog) ASC, candidate."updatedAt" DESC
        LIMIT ${DEFAULT_CANDIDATE_LIMIT}
      `);
    });
  }

  private async formatCandidate(candidate: {
    id: string;
    displayName: string;
    accountStatus?: AccountStatus;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      gender?: Gender | null;
      sexuality?: Sexuality | null;
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
      gender: candidate.profile?.gender ?? null,
      sexuality: candidate.profile?.sexuality ?? null,
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
