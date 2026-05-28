import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, ConnectionStatus, MatchStatus, SubscriptionStatus } from "@prisma/client";
import { calculateAge } from "../common/age";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { getAccountAccessBlock } from "../users/account-status";

const MESSAGE_HISTORY_LIMIT = 100;

type CandidateUser = {
  id: string;
  displayName: string;
  accountStatus: AccountStatus;
  profile: {
    bio: string | null;
    birthDate: Date | null;
    connectionStatus: ConnectionStatus | null;
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
};

type MatchWithUsers = {
  id: string;
  createdAt: Date;
  status: MatchStatus;
  userAId: string;
  userBId: string;
  userA: CandidateUser;
  userB: CandidateUser;
  messages?: Array<FormattedDirectMessageSource>;
  readStates?: Array<{
    lastReadAt: Date;
  }>;
};

type FormattedDirectMessageSource = {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  sender?: {
    id: string;
    displayName: string;
  };
};

type DirectMessageReadReceipt = {
  messageIds: string[];
  readAt: Date;
};

type MatchBlockStatus = "NONE" | "BLOCKED_BY_ME" | "BLOCKED_ME" | "MUTUAL";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getMatches(userId: string) {
    await this.ensureActiveSubscriber(userId);

    const matches = await this.prisma.match.findMany({
      where: {
        status: { in: [MatchStatus.ACTIVE, MatchStatus.BLOCKED] },
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      include: {
        userA: this.userInclude(),
        userB: this.userInclude(),
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                displayName: true
              }
            }
          }
        },
        readStates: {
          where: { userId },
          select: { lastReadAt: true },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    });
    const sortedMatches = [...matches].sort((first, second) => this.getMatchActivityTime(second) - this.getMatchActivityTime(first));
    const formattedMatches = await Promise.all(
      sortedMatches.map(async (match) => {
        const otherUser = match.userAId === userId ? match.userB : match.userA;

        if (otherUser.accountStatus === AccountStatus.DELETED) {
          return null;
        }

        const otherUserId = this.getOtherUserId(match, userId);
        const blockStatus = await this.getMatchBlockStatus(userId, otherUserId);

        if (match.status === MatchStatus.BLOCKED && blockStatus !== "BLOCKED_ME") {
          return null;
        }

        return this.formatMatch(match, userId, blockStatus);
      })
    );

    return {
      matches: formattedMatches.filter((match): match is NonNullable<typeof match> => Boolean(match))
    };
  }

  async getMessages(userId: string, matchId: string) {
    await this.assertMatchParticipant(userId, matchId);

    const messages = await this.prisma.directMessage.findMany({
      where: { matchId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: MESSAGE_HISTORY_LIMIT
    });
    const orderedMessages = [...messages].reverse();

    await this.markMatchRead(userId, matchId);

    return {
      messages: orderedMessages.map((message) => this.formatMessage(message))
    };
  }

  async createMessage(userId: string, matchId: string, rawBody: string) {
    await this.assertMatchParticipant(userId, matchId);

    const body = rawBody.trim();

    if (!body) {
      throw new BadRequestException("Message cannot be empty.");
    }

    await this.assertMessageRecipientAvailable(userId, matchId);

    const message = await this.prisma.directMessage.create({
      data: {
        matchId,
        senderId: userId,
        body
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });

    await this.markMatchReadAt(userId, matchId, new Date());

    return this.formatMessage(message);
  }

  async markMatchRead(userId: string, matchId: string) {
    await this.assertMatchParticipant(userId, matchId);
    const readReceipt = await this.markMatchReadAt(userId, matchId, new Date());

    return {
      ok: true,
      matchId,
      unreadCount: 0,
      readReceipt
    };
  }

  async unmatch(userId: string, matchId: string) {
    await this.ensureActiveSubscriber(userId);

    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      select: {
        id: true,
        userAId: true,
        userBId: true
      }
    });

    if (!match) {
      throw new ForbiddenException("This match is not available to unmatch.");
    }

    const otherUserId = this.getOtherUserId(match, userId);

    await this.prisma.$transaction([
      this.prisma.match.update({
        where: { id: matchId },
        data: { status: MatchStatus.UNMATCHED }
      }),
      this.prisma.discoveryActionLog.deleteMany({
        where: {
          OR: [
            { actorId: userId, targetId: otherUserId },
            { actorId: otherUserId, targetId: userId }
          ]
        }
      })
    ]);

    return {
      unmatched: true,
      matchId,
      otherUserId
    };
  }

  async getUnreadDirectMessageCount(userId: string) {
    await this.ensureActiveSubscriber(userId);

    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }],
        AND: [
          { userA: { accountStatus: { not: AccountStatus.DELETED } } },
          { userB: { accountStatus: { not: AccountStatus.DELETED } } }
        ]
      },
      select: {
        id: true,
        readStates: {
          where: { userId },
          select: { lastReadAt: true },
          take: 1
        }
      }
    });

    const counts = await Promise.all(
      matches.map((match) => this.countUnreadMessages(match.id, userId, match.readStates[0]?.lastReadAt ?? null))
    );

    return counts.reduce((total, count) => total + count, 0);
  }

  async getMatchParticipantIds(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        userAId: true,
        userBId: true
      }
    });

    return match ? [match.userAId, match.userBId] : [];
  }

  async assertMatchParticipant(userId: string, matchId: string) {
    await this.ensureActiveSubscriber(userId);

    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        status: { in: [MatchStatus.ACTIVE, MatchStatus.BLOCKED] },
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      select: {
        id: true
      }
    });

    if (!match) {
      throw new ForbiddenException("This match is not available to you.");
    }

    return match;
  }

  getRoomName(matchId: string) {
    return `match:${matchId}`;
  }

  private async ensureActiveSubscriber(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        accountStatus: true,
        suspendedUntil: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const accountBlock = getAccountAccessBlock(user);

    if (accountBlock) {
      throw new ForbiddenException(accountBlock);
    }

    const subscriptionEndsAt = user.subscriptionEndsAt;

    if (
      user.subscriptionStatus !== SubscriptionStatus.ACTIVE ||
      subscriptionEndsAt === null ||
      subscriptionEndsAt <= new Date()
    ) {
      throw new ForbiddenException("Active crushclub membership required.");
    }
  }

  private async formatMatch(match: MatchWithUsers, currentUserId: string, blockStatus: MatchBlockStatus = "NONE") {
    const otherUser = match.userAId === currentUserId ? match.userB : match.userA;
    const lastMessage = match.messages?.[0];
    const lastReadAt = match.readStates?.[0]?.lastReadAt ?? null;
    const unreadCount = match.status === MatchStatus.ACTIVE
      ? await this.countUnreadMessages(match.id, currentUserId, lastReadAt)
      : 0;

    return {
      id: match.id,
      createdAt: match.createdAt,
      user: await this.formatCandidate(otherUser),
      lastMessage: lastMessage ? this.formatMessage(lastMessage) : null,
      unreadCount,
      blockStatus
    };
  }

  private getMatchActivityTime(match: MatchWithUsers) {
    return (match.messages?.[0]?.createdAt ?? match.createdAt).getTime();
  }

  private async countUnreadMessages(matchId: string, userId: string, lastReadAt: Date | null) {
    return this.prisma.directMessage.count({
      where: {
        matchId,
        senderId: { not: userId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {})
      }
    });
  }

  private async markMatchReadAt(userId: string, matchId: string, lastReadAt: Date): Promise<DirectMessageReadReceipt> {
    return this.prisma.$transaction(async (transaction) => {
      const newlyReadMessages = await transaction.directMessage.findMany({
        where: {
          matchId,
          senderId: { not: userId },
          readAt: null,
          createdAt: { lte: lastReadAt }
        },
        select: {
          id: true
        }
      });
      const messageIds = newlyReadMessages.map((message) => message.id);

      await transaction.matchReadState.upsert({
        where: {
          matchId_userId: {
            matchId,
            userId
          }
        },
        update: {
          lastReadAt
        },
        create: {
          matchId,
          userId,
          lastReadAt
        }
      });

      if (messageIds.length > 0) {
        await transaction.directMessage.updateMany({
          where: {
            id: { in: messageIds }
          },
          data: {
            readAt: lastReadAt
          }
        });
      }

      return {
        messageIds,
        readAt: lastReadAt
      };
    });
  }

  private async formatCandidate(candidate: CandidateUser) {
    return {
      id: candidate.id,
      displayName: candidate.displayName,
      accountStatus: candidate.accountStatus,
      age: candidate.profile?.birthDate ? calculateAge(candidate.profile.birthDate) : null,
      bio: candidate.profile?.bio ?? null,
      connectionStatus: candidate.profile?.connectionStatus ?? null,
      city: candidate.profile?.city ?? null,
      state: candidate.profile?.state ?? null,
      interests: candidate.profile?.interests ?? [],
      photos: await this.storage.signPhotoUrls(candidate.photos)
    };
  }

  private formatMessage(message: FormattedDirectMessageSource) {
    return {
      id: message.id,
      matchId: message.matchId,
      senderId: message.senderId,
      senderName: message.sender?.displayName ?? "crushclub member",
      body: message.body,
      readAt: message.readAt,
      createdAt: message.createdAt
    };
  }

  private userInclude() {
    return {
      include: {
        profile: true,
        photos: {
          orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
          take: 6
        }
      }
    };
  }

  private async assertMessageRecipientAvailable(userId: string, matchId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      include: {
        userA: {
          select: {
            accountStatus: true,
            suspendedUntil: true
          }
        },
        userB: {
          select: {
            accountStatus: true,
            suspendedUntil: true
          }
        }
      }
    });

    if (!match) {
      throw new ForbiddenException("This match is not available to you.");
    }

    const otherUserId = this.getOtherUserId(match, userId);
    const blockStatus = await this.getMatchBlockStatus(userId, otherUserId);

    if (blockStatus === "BLOCKED_ME") {
      throw new ForbiddenException("This member has blocked you, so you cannot send messages.");
    }

    if (blockStatus === "BLOCKED_BY_ME") {
      throw new ForbiddenException("Unblock this account before sending messages.");
    }

    if (blockStatus === "MUTUAL") {
      throw new ForbiddenException("You cannot message this account while either account is blocked.");
    }

    const otherUser = match.userAId === userId ? match.userB : match.userA;
    const accountBlock = getAccountAccessBlock(otherUser);

    if (accountBlock) {
      throw new ForbiddenException("This account is currently unavailable.");
    }
  }

  private getOtherUserId(match: { userAId: string; userBId: string }, userId: string) {
    return match.userAId === userId ? match.userBId : match.userAId;
  }

  private async getMatchBlockStatus(userId: string, otherUserId: string): Promise<MatchBlockStatus> {
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: userId }
        ]
      },
      select: {
        blockerId: true,
        blockedId: true
      }
    });
    const blockedByMe = blocks.some((block) => block.blockerId === userId && block.blockedId === otherUserId);
    const blockedMe = blocks.some((block) => block.blockerId === otherUserId && block.blockedId === userId);

    if (blockedByMe && blockedMe) {
      return "MUTUAL";
    }

    if (blockedByMe) {
      return "BLOCKED_BY_ME";
    }

    if (blockedMe) {
      return "BLOCKED_ME";
    }

    return "NONE";
  }
}
