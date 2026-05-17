import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConnectionStatus, MatchStatus, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const MESSAGE_HISTORY_LIMIT = 100;

type CandidateUser = {
  id: string;
  displayName: string;
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
        status: MatchStatus.ACTIVE,
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

    return {
      matches: await Promise.all(sortedMatches.map((match) => this.formatMatch(match, userId)))
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

  async getUnreadDirectMessageCount(userId: string) {
    await this.ensureActiveSubscriber(userId);

    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }]
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
        status: MatchStatus.ACTIVE,
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
        subscriptionEndsAt: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
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

  private async formatMatch(match: MatchWithUsers, currentUserId: string) {
    const otherUser = match.userAId === currentUserId ? match.userB : match.userA;
    const lastMessage = match.messages?.[0];
    const lastReadAt = match.readStates?.[0]?.lastReadAt ?? null;
    const unreadCount = await this.countUnreadMessages(match.id, currentUserId, lastReadAt);

    return {
      id: match.id,
      createdAt: match.createdAt,
      user: await this.formatCandidate(otherUser),
      lastMessage: lastMessage ? this.formatMessage(lastMessage) : null,
      unreadCount
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
      age: candidate.profile?.birthDate ? this.calculateAge(candidate.profile.birthDate) : null,
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

  private calculateAge(birthDate: Date) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();

    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age;
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
}
