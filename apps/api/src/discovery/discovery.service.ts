import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DiscoveryAction, MatchStatus, SubscriptionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { BlockUserDto } from "./dto/block-user.dto";
import { DiscoveryActionDto } from "./dto/discovery-action.dto";
import { ReportUserDto } from "./dto/report-user.dto";

const DEFAULT_CANDIDATE_LIMIT = 12;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getCandidates(userId: string) {
    await this.ensureCurrentProfileReady(userId);

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
        role: UserRole.USER,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionEndsAt: { gt: now },
        profile: {
          is: {
            bio: { not: null },
            birthDate: { not: null },
            city: { not: null },
            state: { not: null },
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
      take: DEFAULT_CANDIDATE_LIMIT
    });

    return {
      candidates: await Promise.all(candidates.map((candidate) => this.formatCandidate(candidate)))
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
        OR: [{ userAId: userId }, { userBId: userId }]
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
      where: this.getMatchPair(userId, dto.targetUserId),
      data: { status: MatchStatus.BLOCKED }
    });

    return {
      blocked: true,
      block
    };
  }

  async reportUser(userId: string, dto: ReportUserDto) {
    this.ensureDifferentUsers(userId, dto.targetUserId);
    await this.ensureUserExists(dto.targetUserId);

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
        role: UserRole.USER,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionEndsAt: { gt: new Date() },
        profile: {
          is: {
            bio: { not: null },
            birthDate: { not: null },
            city: { not: null },
            state: { not: null },
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
        profile: {
          select: {
            bio: true,
            birthDate: true,
            city: true,
            state: true,
            interests: true
          }
        },
        photos: {
          select: { id: true },
          take: 1
        }
      }
    });

    const profile = user?.profile;
    const isReady =
      Boolean(profile?.bio?.trim()) &&
      Boolean(profile?.birthDate) &&
      Boolean(profile?.city?.trim()) &&
      Boolean(profile?.state?.trim()) &&
      Boolean(profile?.interests.length) &&
      Boolean(user?.photos.length);

    if (!isReady) {
      throw new ForbiddenException("Complete your profile setup before using discovery.");
    }
  }

  private ensureDifferentUsers(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("You cannot perform this action on your own profile.");
    }
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!user) {
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

  private async formatCandidate(candidate: {
    id: string;
    displayName: string;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      city: string | null;
      state: string | null;
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
  }) {
    return {
      id: candidate.id,
      displayName: candidate.displayName,
      age: candidate.profile?.birthDate ? this.calculateAge(candidate.profile.birthDate) : null,
      bio: candidate.profile?.bio ?? null,
      city: candidate.profile?.city ?? null,
      state: candidate.profile?.state ?? null,
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

  private calculateAge(birthDate: Date) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();

    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age;
  }
}
