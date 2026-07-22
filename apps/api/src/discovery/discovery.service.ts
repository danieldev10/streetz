import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AccountStatus, ConnectionStatus, DiscoveryAction, DiscoveryGender, FaceVerificationStatus, Gender, MatchStatus, Prisma, ReportStatus, Sexuality, SubscriptionStatus, UserRole } from "@prisma/client";
import { calculateAge } from "../common/age";
import { getCheckedInStandardEventCounts } from "../common/attendance";
import { isProfileSetupComplete } from "../common/profile-readiness";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { getAccountAccessBlock } from "../users/account-status";
import { VerificationService } from "../verification/verification.service";
import { BlockUserDto } from "./dto/block-user.dto";
import { DiscoveryActionDto } from "./dto/discovery-action.dto";
import { ReportUserDto } from "./dto/report-user.dto";
import { UnblockUserDto } from "./dto/unblock-user.dto";
import { areDiscoveryProfilesCompatible } from "./discovery-compatibility";
import { selectDiscoveryDeck, seededUnitInterval, type DiscoveryRankedCandidate } from "./discovery-ranking";

const DISCOVERY_DECK_SIZE = 12;
const DISCOVERY_POOL_SIZE = 100;
const DISCOVERY_ALGORITHM = "mutual-v1";

type ReadyDiscoveryProfile = {
  birthDate: Date;
  discoveryGender: DiscoveryGender;
  interestedInGenders: DiscoveryGender[];
  minAge: number;
  maxAge: number;
  interests: string[];
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
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly verification: VerificationService
  ) {}

  async getCandidates(userId: string) {
    const currentProfile = await this.ensureCurrentProfileReady(userId);

    const now = new Date();
    await this.prisma.user.update({ where: { id: userId }, data: { lastDiscoveryActiveAt: now } });
    const requiresFaceVerification = this.verification.isRequired();
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
      discoveryPreference: true,
      photos: {
        orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
        take: 6
      }
    };

    let rankedCandidates: Array<DiscoveryRankedCandidate<Prisma.UserGetPayload<{ include: typeof candidateInclude }>>>;

    if (currentProfile.latitude !== null && currentProfile.longitude !== null) {
      const nearbyRows = await this.getNearbyCandidateRows(currentProfile, excludedIds, now);
      const nearbyCandidateIds = nearbyRows.map((row) => row.id);
      const candidates =
        nearbyCandidateIds.length > 0
          ? await this.prisma.user.findMany({
              where: { id: { in: nearbyCandidateIds } },
              include: candidateInclude
            })
          : [];
      const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

      rankedCandidates = this.rankCandidates(
        nearbyRows
          .map((row) => {
            const candidate = candidatesById.get(row.id);
            return candidate ? { candidate, distanceKm: row.distanceKm } : null;
          })
          .filter((row): row is { candidate: (typeof candidates)[number]; distanceKm: number } => Boolean(row)),
        currentProfile,
        now,
        userId
      );
    } else {
      const viewerAge = calculateAge(currentProfile.birthDate);
      const candidateBirthDateWhere = this.getBirthDateWhere(currentProfile.minAge, currentProfile.maxAge, now);
      const candidates = await this.prisma.user.findMany({
        where: {
          id: { notIn: Array.from(excludedIds) },
          accountStatus: AccountStatus.ACTIVE,
          ...(requiresFaceVerification ? { faceVerificationStatus: FaceVerificationStatus.VERIFIED } : {}),
          role: UserRole.USER,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEndsAt: { gt: now },
          discoveryPreference: {
            is: {
              confirmedAt: { not: null },
              interestedInGenders: { has: currentProfile.discoveryGender },
              minAge: { lte: viewerAge },
              maxAge: { gte: viewerAge }
            }
          },
          profile: {
            is: {
              bio: { not: null },
              birthDate: candidateBirthDateWhere,
              discoveryGender: { in: currentProfile.interestedInGenders },
              city: { not: null },
              state: { not: null },
              connectionStatus: { not: null },
              discoveryLive: true,
              interests: { isEmpty: false }
            }
          },
          photos: { some: {} }
        },
        include: candidateInclude,
        orderBy: { lastDiscoveryActiveAt: "desc" },
        take: DISCOVERY_POOL_SIZE
      });

      rankedCandidates = this.rankCandidates(
        candidates.map((candidate) => ({ candidate, distanceKm: null })),
        currentProfile,
        now,
        userId
      );
    }

    const deck = selectDiscoveryDeck(
      rankedCandidates,
      `${userId}:${now.toISOString().slice(0, 10)}`,
      DISCOVERY_DECK_SIZE
    );
    const [attendanceByUserId] = await Promise.all([
      getCheckedInStandardEventCounts(
        this.prisma,
        deck.map(({ candidate }) => candidate.id)
      ),
      this.recordImpressions(userId, deck, now)
    ]);

    return {
      candidates: await Promise.all(deck.map(({ candidate, distanceKm }) => this.formatCandidate(candidate, {
        distanceKm,
        attendedEventCount: attendanceByUserId.get(candidate.id) ?? 0
      }))),
      location: this.formatLocationMeta(currentProfile),
      algorithm: DISCOVERY_ALGORITHM
    };
  }

  async recordAction(userId: string, dto: DiscoveryActionDto) {
    const currentProfile = await this.ensureCurrentProfileReady(userId);
    this.ensureDifferentUsers(userId, dto.targetUserId);
    const targetConnectionStatus = dto.action === DiscoveryAction.LIKE
      ? await this.ensureActionTarget(userId, dto.targetUserId, currentProfile)
      : (await this.ensureUserExists(dto.targetUserId), null);

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

    if (!targetConnectionStatus) {
      throw new NotFoundException("Discovery profile not found.");
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

    const matchedAt = new Date();
    const matchStatusSnapshot = this.getMatchStatusSnapshot(
      pair,
      userId,
      currentProfile.connectionStatus,
      targetConnectionStatus
    );

    const match = await this.prisma.match.upsert({
      where: {
        userAId_userBId: pair
      },
      create: {
        ...pair,
        status: MatchStatus.ACTIVE,
        createdAt: matchedAt,
        ...matchStatusSnapshot
      },
      update: {
        status: MatchStatus.ACTIVE,
        createdAt: matchedAt,
        ...matchStatusSnapshot
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

    const otherUser = match.userAId === userId ? match.userB : match.userA;
    const attendanceByUserId = await getCheckedInStandardEventCounts(this.prisma, [otherUser.id]);

    return {
      action,
      matched: true,
      match: await this.formatMatch(match, userId, attendanceByUserId.get(otherUser.id) ?? 0)
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

    const otherUserIds = matches.map((match) => match.userAId === userId ? match.userBId : match.userAId);
    const attendanceByUserId = await getCheckedInStandardEventCounts(this.prisma, otherUserIds);

    return {
      matches: await Promise.all(matches.map((match) => {
        const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
        return this.formatMatch(match, userId, attendanceByUserId.get(otherUserId) ?? 0);
      }))
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

    const attendanceByUserId = await getCheckedInStandardEventCounts(
      this.prisma,
      blocks.map((block) => block.blockedId)
    );

    return {
      blockedUsers: await Promise.all(
        blocks.map(async (block) => ({
          ...(await this.formatCandidate(block.blocked, {
            attendedEventCount: attendanceByUserId.get(block.blockedId) ?? 0
          })),
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

  private async ensureActionTarget(userId: string, targetUserId: string, currentProfile: ReadyDiscoveryProfile) {
    this.ensureDifferentUsers(userId, targetUserId);

    const target = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        accountStatus: AccountStatus.ACTIVE,
        ...(this.verification.isRequired() ? { faceVerificationStatus: FaceVerificationStatus.VERIFIED } : {}),
        role: UserRole.USER,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionEndsAt: { gt: new Date() },
        profile: {
          is: {
            bio: { not: null },
            birthDate: { not: null },
            city: { not: null },
            state: { not: null },
            connectionStatus: { not: null },
            discoveryGender: { in: currentProfile.interestedInGenders },
            discoveryLive: true,
            interests: { isEmpty: false }
          }
        },
        photos: { some: {} }
      },
      select: {
        id: true,
        discoveryPreference: true,
        profile: {
          select: {
            birthDate: true,
            discoveryGender: true,
            connectionStatus: true
          }
        }
      }
    });

    if (
      !target?.profile?.connectionStatus ||
      !target.profile.birthDate ||
      !target.profile.discoveryGender ||
      !target.discoveryPreference?.confirmedAt ||
      !target.discoveryPreference.interestedInGenders.includes(currentProfile.discoveryGender)
    ) {
      throw new NotFoundException("Discovery profile not found.");
    }

    const compatible = areDiscoveryProfilesCompatible(currentProfile, {
      birthDate: target.profile.birthDate,
      discoveryGender: target.profile.discoveryGender,
      interestedInGenders: target.discoveryPreference.interestedInGenders,
      minAge: target.discoveryPreference.minAge,
      maxAge: target.discoveryPreference.maxAge
    });

    if (!compatible) {
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

    return target.profile.connectionStatus;
  }

  private async ensureCurrentProfileReady(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountStatus: true,
        suspendedUntil: true,
        faceVerificationStatus: true,
        profile: {
          select: {
            bio: true,
            birthDate: true,
            discoveryGender: true,
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
        discoveryPreference: true,
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

      if (this.verification.isRequired() && user.faceVerificationStatus !== FaceVerificationStatus.VERIFIED) {
        throw new ForbiddenException("Verify your face before using discovery.");
      }
    }

    const profile = user?.profile;
    const connectionStatus = profile?.connectionStatus;
    const isReady = isProfileSetupComplete({
      profile,
      photos: user?.photos ?? []
    });

    const preference = user?.discoveryPreference;

    if (
      !profile ||
      !isReady ||
      !connectionStatus ||
      !profile.birthDate ||
      !profile.discoveryGender ||
      !preference?.confirmedAt ||
      preference.interestedInGenders.length === 0
    ) {
      throw new ForbiddenException("Complete your profile setup before using discovery.");
    }

    return {
      birthDate: profile.birthDate,
      discoveryGender: profile.discoveryGender,
      interestedInGenders: preference.interestedInGenders,
      minAge: preference.minAge,
      maxAge: preference.maxAge,
      interests: profile.interests,
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

  private getMatchStatusSnapshot(
    pair: { userAId: string; userBId: string },
    actorId: string,
    actorConnectionStatus: ConnectionStatus,
    targetConnectionStatus: ConnectionStatus
  ) {
    return {
      userAConnectionStatusAtMatch: pair.userAId === actorId ? actorConnectionStatus : targetConnectionStatus,
      userBConnectionStatusAtMatch: pair.userBId === actorId ? actorConnectionStatus : targetConnectionStatus
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

  private async getNearbyCandidateRows(profile: ReadyDiscoveryProfile, excludedIds: Set<string>, now: Date) {
    if (profile.latitude === null || profile.longitude === null) {
      return [];
    }

    const hasDistanceLimit = profile.maxDistanceKm > 0;
    const maxDistanceMeters = profile.maxDistanceKm * 1000;
    const excludedIdList = Array.from(excludedIds);
    const viewerAge = calculateAge(profile.birthDate);
    const minBirthDate = new Date(now.getFullYear() - (profile.maxAge + 1), now.getMonth(), now.getDate());
    const maxBirthDate = new Date(now.getFullYear() - profile.minAge, now.getMonth(), now.getDate());

    return this.prisma.$transaction(async (transaction) => {
      // Supabase installs PostGIS in "extensions"; local databases may use "public".
      await transaction.$executeRaw`SET LOCAL search_path = public, extensions`;

      return transaction.$queryRaw<SpatialCandidateRow[]>(Prisma.sql`
        WITH origin AS (
          SELECT ST_SetSRID(ST_MakePoint(${profile.longitude}, ${profile.latitude}), 4326)::geography AS geog
        ), nearby_profiles AS MATERIALIZED (
          SELECT
            candidate_profile."userId",
            ST_Distance(candidate_profile."location", origin.geog) AS distance_meters
          FROM origin
          JOIN "Profile" AS candidate_profile ON TRUE
          WHERE candidate_profile."bio" IS NOT NULL
            AND candidate_profile."birthDate" IS NOT NULL
            AND candidate_profile."birthDate" > ${minBirthDate}
            AND candidate_profile."birthDate" <= ${maxBirthDate}
            AND candidate_profile."discoveryGender" = ANY(ARRAY[${Prisma.join(profile.interestedInGenders)}]::"DiscoveryGender"[])
            AND candidate_profile."city" IS NOT NULL
            AND candidate_profile."state" IS NOT NULL
            AND candidate_profile."connectionStatus" IS NOT NULL
            AND candidate_profile."discoveryLive" = TRUE
            AND cardinality(candidate_profile."interests") > 0
            AND candidate_profile."location" IS NOT NULL
            ${hasDistanceLimit ? Prisma.sql`AND ST_DWithin(candidate_profile."location", origin.geog, ${maxDistanceMeters})` : Prisma.sql``}
        )
        SELECT
          candidate."id",
          (nearby_profiles.distance_meters / 1000.0)::double precision AS "distanceKm"
        FROM nearby_profiles
        JOIN "User" AS candidate ON candidate."id" = nearby_profiles."userId"
        JOIN "DiscoveryPreference" AS candidate_preference ON candidate_preference."userId" = candidate."id"
        WHERE candidate."id" NOT IN (${Prisma.join(excludedIdList)})
          AND candidate."accountStatus" = CAST(${AccountStatus.ACTIVE} AS "AccountStatus")
          ${this.verification.isRequired() ? Prisma.sql`AND candidate."faceVerificationStatus" = CAST(${FaceVerificationStatus.VERIFIED} AS "FaceVerificationStatus")` : Prisma.sql``}
          AND candidate."role" = CAST(${UserRole.USER} AS "UserRole")
          AND candidate."subscriptionStatus" = CAST(${SubscriptionStatus.ACTIVE} AS "SubscriptionStatus")
          AND candidate."subscriptionEndsAt" > ${now}
          AND candidate_preference."interestedInGenders" @> ARRAY[${profile.discoveryGender}::"DiscoveryGender"]
          AND candidate_preference."confirmedAt" IS NOT NULL
          AND candidate_preference."minAge" <= ${viewerAge}
          AND candidate_preference."maxAge" >= ${viewerAge}
          AND EXISTS (
            SELECT 1
            FROM "ProfilePhoto" AS photo
            WHERE photo."userId" = candidate."id"
          )
        ORDER BY nearby_profiles.distance_meters ASC, candidate."lastDiscoveryActiveAt" DESC
        LIMIT ${DISCOVERY_POOL_SIZE}
      `);
    });
  }

  private getBirthDateWhere(minAge: number, maxAge: number, now: Date): Prisma.DateTimeNullableFilter {
    return {
      not: null,
      gt: new Date(now.getFullYear() - (maxAge + 1), now.getMonth(), now.getDate()),
      lte: new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate())
    };
  }

  private rankCandidates<T extends {
    id: string;
    lastDiscoveryActiveAt: Date;
    profile: { connectionStatus: ConnectionStatus | null; interests: string[]; bio: string | null } | null;
    photos: unknown[];
  }>(
    rows: Array<{ candidate: T; distanceKm: number | null }>,
    viewer: ReadyDiscoveryProfile,
    now: Date,
    viewerId: string
  ): Array<DiscoveryRankedCandidate<T>> {
    const maxDistance = viewer.maxDistanceKm > 0 ? viewer.maxDistanceKm : 500;
    const viewerInterests = new Set(viewer.interests.map((interest) => interest.toLowerCase()));

    return rows
      .map(({ candidate, distanceKm }) => {
        const distanceScore = distanceKm === null ? 0.5 : Math.max(0, 1 - distanceKm / maxDistance);
        const ageInDays = Math.max(0, (now.getTime() - candidate.lastDiscoveryActiveAt.getTime()) / 86_400_000);
        const activityScore = Math.max(0, 1 - ageInDays / 30);
        const candidateInterests = candidate.profile?.interests ?? [];
        const sharedInterestCount = candidateInterests.filter((interest) => viewerInterests.has(interest.toLowerCase())).length;
        const interestScore = Math.min(1, sharedInterestCount / 3);
        const connectionScore = candidate.profile?.connectionStatus === viewer.connectionStatus ? 1 : 0.35;
        const profileScore = Math.min(1, ((candidate.profile?.bio?.length ?? 0) / 200) * 0.5 + (candidate.photos.length / 4) * 0.5);
        const explorationScore = seededUnitInterval(`${viewerId}:${candidate.id}:${now.toISOString().slice(0, 10)}`);
        const score =
          distanceScore * 0.45 +
          activityScore * 0.1 +
          interestScore * 0.15 +
          connectionScore * 0.1 +
          profileScore * 0.15 +
          explorationScore * 0.05;

        return { candidate, distanceKm, score };
      })
      .sort((first, second) => second.score - first.score);
  }

  private async recordImpressions<T extends { candidate: { id: string }; score: number }>(
    viewerId: string,
    deck: T[],
    shownAt: Date
  ) {
    if (deck.length === 0) return;

    await this.prisma.discoveryImpression.createMany({
      data: deck.map((item, rank) => ({
        viewerId,
        candidateId: item.candidate.id,
        shownAt,
        rank,
        score: item.score,
        algorithm: DISCOVERY_ALGORITHM
      }))
    }).catch((error) => {
      this.logger.warn(`Unable to record discovery impressions: ${error instanceof Error ? error.message : "unknown error"}`);
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
      showGender?: boolean;
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
  }, options: { distanceKm?: number | null; attendedEventCount: number }) {
    const photos = await this.storage.signPhotoUrls(candidate.photos);

    return {
      id: candidate.id,
      displayName: candidate.displayName,
      accountStatus: candidate.accountStatus ?? AccountStatus.ACTIVE,
      age: candidate.profile?.birthDate ? calculateAge(candidate.profile.birthDate) : null,
      bio: candidate.profile?.bio ?? null,
      gender: candidate.profile?.showGender === false ? null : candidate.profile?.gender ?? null,
      sexuality: candidate.profile?.sexuality ?? null,
      connectionStatus: candidate.profile?.connectionStatus ?? null,
      city: candidate.profile?.city ?? null,
      state: candidate.profile?.state ?? null,
      distanceKm: options.distanceKm === null || options.distanceKm === undefined ? null : Math.round(options.distanceKm * 10) / 10,
      attendedEventCount: options.attendedEventCount,
      interests: candidate.profile?.interests ?? [],
      photos
    };
  }

  private async formatMatch(
    match: {
      id: string;
      createdAt: Date;
      userAId: string;
      userAConnectionStatusAtMatch: ConnectionStatus | null;
      userBConnectionStatusAtMatch: ConnectionStatus | null;
      userA: Parameters<DiscoveryService["formatCandidate"]>[0];
      userB: Parameters<DiscoveryService["formatCandidate"]>[0];
    },
    currentUserId: string,
    attendedEventCount: number
  ) {
    const otherUser = match.userAId === currentUserId ? match.userB : match.userA;
    const matchedConnectionStatus = match.userAId === currentUserId
      ? match.userBConnectionStatusAtMatch
      : match.userAConnectionStatusAtMatch;

    return {
      id: match.id,
      createdAt: match.createdAt,
      matchedConnectionStatus: matchedConnectionStatus ?? otherUser.profile?.connectionStatus ?? null,
      user: await this.formatCandidate(otherUser, { attendedEventCount })
    };
  }

}
