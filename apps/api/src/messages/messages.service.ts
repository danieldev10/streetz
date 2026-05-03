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
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      matches: await Promise.all(matches.map((match) => this.formatMatch(match, userId)))
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
      orderBy: { createdAt: "asc" },
      take: MESSAGE_HISTORY_LIMIT
    });

    return {
      messages: messages.map((message) => this.formatMessage(message))
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

    return this.formatMessage(message);
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
      throw new ForbiddenException("Active Streetz membership required.");
    }
  }

  private async formatMatch(match: MatchWithUsers, currentUserId: string) {
    const otherUser = match.userAId === currentUserId ? match.userB : match.userA;
    const lastMessage = match.messages?.[0];

    return {
      id: match.id,
      createdAt: match.createdAt,
      user: await this.formatCandidate(otherUser),
      lastMessage: lastMessage ? this.formatMessage(lastMessage) : null
    };
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
      senderName: message.sender?.displayName ?? "Streetz member",
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
