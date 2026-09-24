import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, ConnectionStatus, FaceVerificationStatus, MatchStatus, Prisma, SubscriptionStatus, UserRole } from "@prisma/client";
import { calculateAge } from "../common/age";
import { countCheckedInStandardEvents } from "../common/attendance";
import { isProfileSetupComplete } from "../common/profile-readiness";
import { areDiscoveryProfilesCompatible } from "../discovery/discovery-compatibility";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { normalizeMessageContent } from "../common/message-content";
import { getAccountAccessBlock } from "../users/account-status";
import { VerificationService } from "../verification/verification.service";
import { MessagePageDto } from "../common/dto/message-page.dto";

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
  requestedById: string | null;
  acceptedAt: Date | null;
  closedAt: Date | null;
  userAConnectionStatusAtMatch: ConnectionStatus | null;
  userBConnectionStatusAtMatch: ConnectionStatus | null;
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
  gifUrl: string | null;
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

type RequestParticipant = Prisma.UserGetPayload<{
  select: {
    id: true;
    role: true;
    accountStatus: true;
    suspendedUntil: true;
    subscriptionStatus: true;
    subscriptionEndsAt: true;
    faceVerificationStatus: true;
    profile: true;
    discoveryPreference: true;
    photos: { select: { id: true } };
  };
}>;

const DAILY_CONVERSATION_REQUEST_LIMIT = 10;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly verification: VerificationService
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
      matches: formattedMatches.filter((match): match is NonNullable<typeof match> => Boolean(match)),
      conversations: formattedMatches.filter((match): match is NonNullable<typeof match> => Boolean(match))
    };
  }

  async getConversationRequests(userId: string) {
    await this.ensureActiveSubscriber(userId);

    const requests = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.REQUESTED,
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      include: this.threadInclude(userId),
      orderBy: { createdAt: "desc" }
    });
    const formatted = await Promise.all(requests.map((request) => this.formatMatch(request, userId)));

    return {
      received: formatted.filter((request) => request.requestDirection === "RECEIVED"),
      sent: formatted.filter((request) => request.requestDirection === "SENT")
    };
  }

  async createConversationRequest(userId: string, targetUserId: string, rawBody: string) {
    await this.ensureActiveSubscriber(userId);
    this.ensureDifferentUsers(userId, targetUserId);
    const { body } = normalizeMessageContent(rawBody);
    const pair = this.getConversationPair(userId, targetUserId);
    const blockStatus = await this.getMatchBlockStatus(userId, targetUserId);

    if (blockStatus !== "NONE") {
      throw new ForbiddenException("This profile is not available for messages.");
    }

    const existing = await this.prisma.match.findUnique({
      where: { userAId_userBId: pair },
      include: this.threadInclude(userId)
    });

    if (existing) {
      if (existing.status === MatchStatus.ACTIVE) {
        const message = await this.createMessage(userId, existing.id, body);
        return {
          created: false,
          accepted: true,
          conversation: await this.getFormattedConversation(userId, existing.id),
          message
        };
      }

      if (existing.status === MatchStatus.REQUESTED && existing.requestedById === userId) {
        return { created: false, conversation: await this.formatMatch(existing, userId), message: undefined };
      }

      if (existing.status === MatchStatus.REQUESTED && existing.requestedById === targetUserId) {
        const [sender, target] = await Promise.all([
          this.getRequestParticipant(userId),
          this.getRequestParticipant(targetUserId)
        ]);
        this.assertDiscoverableRequestPair(sender, target);

        const [, reply] = await this.prisma.$transaction([
          this.prisma.match.update({
            where: { id: existing.id },
            data: { status: MatchStatus.ACTIVE, acceptedAt: new Date(), closedAt: null }
          }),
          this.prisma.directMessage.create({
            data: { matchId: existing.id, senderId: userId, body }
          })
        ]);

        return {
          created: false,
          accepted: true,
          conversation: await this.getFormattedConversation(userId, existing.id),
          message: this.formatMessage(reply)
        };
      }

      throw new ForbiddenException("A previous conversation with this member is closed.");
    }

    const [sender, target, recentRequestCount] = await Promise.all([
      this.getRequestParticipant(userId),
      this.getRequestParticipant(targetUserId),
      this.prisma.match.count({
        where: {
          requestedById: userId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    if (recentRequestCount >= DAILY_CONVERSATION_REQUEST_LIMIT) {
      throw new ForbiddenException("You have reached today’s message request limit.");
    }

    this.assertDiscoverableRequestPair(sender, target);
    const statusSnapshot = this.getConnectionStatusSnapshot(pair, userId, sender.profile!.connectionStatus!, target.profile!.connectionStatus!);

    try {
      const conversation = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.match.create({
          data: {
            ...pair,
            status: MatchStatus.REQUESTED,
            requestedById: userId,
            ...statusSnapshot
          }
        });

        await transaction.directMessage.create({
          data: { matchId: created.id, senderId: userId, body }
        });

        return created;
      });

      return { created: true, conversation: await this.getFormattedConversation(userId, conversation.id), message: undefined };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.prisma.match.findUnique({
          where: { userAId_userBId: pair },
          include: this.threadInclude(userId)
        });

        if (concurrent) {
          return { created: false, conversation: await this.formatMatch(concurrent, userId), message: undefined };
        }
      }

      throw error;
    }
  }

  async acceptConversationRequest(userId: string, conversationId: string) {
    await this.ensureActiveSubscriber(userId);
    const request = await this.getReceivedRequest(userId, conversationId);
    const requesterId = request.requestedById!;
    const [requester, recipient, blockStatus] = await Promise.all([
      this.getRequestParticipant(requesterId),
      this.getRequestParticipant(userId),
      this.getMatchBlockStatus(userId, requesterId)
    ]);

    if (blockStatus !== "NONE") {
      throw new ForbiddenException("This message request is no longer available.");
    }

    this.assertDiscoverableRequestPair(requester, recipient);

    await this.prisma.match.update({
      where: { id: request.id },
      data: { status: MatchStatus.ACTIVE, acceptedAt: new Date(), closedAt: null }
    });

    return { accepted: true, conversation: await this.getFormattedConversation(userId, request.id) };
  }

  async declineConversationRequest(userId: string, conversationId: string) {
    await this.ensureActiveSubscriber(userId);
    const request = await this.getReceivedRequest(userId, conversationId);

    await this.prisma.match.update({
      where: { id: request.id },
      data: { status: MatchStatus.DECLINED, closedAt: new Date() }
    });

    return { declined: true, conversationId: request.id };
  }

  async getMessages(userId: string, matchId: string, page: MessagePageDto = new MessagePageDto()) {
    await this.assertMatchParticipant(userId, matchId);

    if (page.cursor) {
      const cursorExists = await this.prisma.directMessage.count({ where: { id: page.cursor, matchId } });

      if (cursorExists !== 1) {
        throw new BadRequestException("Message cursor is not valid for this match.");
      }
    }

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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {})
    });
    const hasMore = messages.length > page.limit;
    const selectedMessages = hasMore ? messages.slice(0, page.limit) : messages;
    const orderedMessages = [...selectedMessages].reverse();

    if (!page.cursor) {
      await this.markMatchRead(userId, matchId);
    }

    return {
      messages: orderedMessages.map((message) => this.formatMessage(message)),
      hasMore,
      nextCursor: hasMore ? selectedMessages.at(-1)?.id ?? null : null
    };
  }

  async createMessage(userId: string, matchId: string, rawBody?: string, rawGifUrl?: string) {
    await this.assertMatchParticipant(userId, matchId);

    const { body, gifUrl } = normalizeMessageContent(rawBody, rawGifUrl);

    await this.assertMessageRecipientAvailable(userId, matchId);

    const message = await this.prisma.directMessage.create({
      data: {
        matchId,
        senderId: userId,
        body,
        gifUrl
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

  async closeConversation(userId: string, conversationId: string) {
    await this.ensureActiveSubscriber(userId);

    const conversation = await this.prisma.match.findFirst({
      where: {
        id: conversationId,
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      select: { id: true, userAId: true, userBId: true }
    });

    if (!conversation) {
      throw new ForbiddenException("This conversation is not available to close.");
    }

    await this.prisma.match.update({
      where: { id: conversation.id },
      data: { status: MatchStatus.CLOSED, closedAt: new Date() }
    });

    return {
      closed: true,
      conversationId: conversation.id,
      otherUserId: this.getOtherUserId(conversation, userId)
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
    const matchedConnectionStatus = match.userAId === currentUserId
      ? match.userBConnectionStatusAtMatch
      : match.userAConnectionStatusAtMatch;
    const unreadCount = match.status === MatchStatus.ACTIVE
      ? await this.countUnreadMessages(match.id, currentUserId, lastReadAt)
      : 0;

    return {
      id: match.id,
      createdAt: match.createdAt,
      status: match.status,
      requestedById: match.requestedById,
      requestDirection: match.status === MatchStatus.REQUESTED
        ? match.requestedById === currentUserId ? "SENT" as const : "RECEIVED" as const
        : null,
      acceptedAt: match.acceptedAt,
      closedAt: match.closedAt,
      matchedConnectionStatus: matchedConnectionStatus ?? otherUser.profile?.connectionStatus ?? null,
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
    const [photos, attendedEventCount] = await Promise.all([
      this.storage.signPhotoUrls(candidate.photos),
      countCheckedInStandardEvents(this.prisma, candidate.id)
    ]);

    return {
      id: candidate.id,
      displayName: candidate.displayName,
      accountStatus: candidate.accountStatus,
      age: candidate.profile?.birthDate ? calculateAge(candidate.profile.birthDate) : null,
      bio: candidate.profile?.bio ?? null,
      connectionStatus: candidate.profile?.connectionStatus ?? null,
      city: candidate.profile?.city ?? null,
      state: candidate.profile?.state ?? null,
      attendedEventCount,
      interests: candidate.profile?.interests ?? [],
      photos
    };
  }

  private formatMessage(message: FormattedDirectMessageSource) {
    return {
      id: message.id,
      matchId: message.matchId,
      conversationId: message.matchId,
      senderId: message.senderId,
      senderName: message.sender?.displayName ?? "crushclub member",
      body: message.body,
      gifUrl: message.gifUrl,
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

  private threadInclude(userId: string) {
    return {
      userA: this.userInclude(),
      userB: this.userInclude(),
      messages: {
        orderBy: { createdAt: "desc" as const },
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
    };
  }

  private async getFormattedConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.match.findUnique({
      where: { id: conversationId },
      include: this.threadInclude(userId)
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found.");
    }

    return this.formatMatch(conversation, userId);
  }

  private async getReceivedRequest(userId: string, conversationId: string) {
    const request = await this.prisma.match.findFirst({
      where: {
        id: conversationId,
        status: MatchStatus.REQUESTED,
        requestedById: { not: userId },
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      select: { id: true, requestedById: true }
    });

    if (!request) {
      throw new ForbiddenException("This message request is not available to you.");
    }

    return request;
  }

  private async getRequestParticipant(userId: string): Promise<RequestParticipant> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        accountStatus: true,
        suspendedUntil: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        faceVerificationStatus: true,
        profile: true,
        discoveryPreference: true,
        photos: { select: { id: true }, take: 1 }
      }
    });

    if (!user) {
      throw new NotFoundException("Member not found.");
    }

    return user;
  }

  private assertDiscoverableRequestPair(sender: RequestParticipant, target: RequestParticipant) {
    const now = new Date();
    const senderBlock = getAccountAccessBlock(sender);
    const targetBlock = getAccountAccessBlock(target);

    if (
      senderBlock ||
      targetBlock ||
      sender.role !== UserRole.USER ||
      target.role !== UserRole.USER ||
      sender.subscriptionStatus !== SubscriptionStatus.ACTIVE ||
      !sender.subscriptionEndsAt ||
      sender.subscriptionEndsAt <= now ||
      target.subscriptionStatus !== SubscriptionStatus.ACTIVE ||
      !target.subscriptionEndsAt ||
      target.subscriptionEndsAt <= now
    ) {
      throw new ForbiddenException("This profile is not available for messages.");
    }

    if (
      this.verification.isRequired() &&
      (sender.faceVerificationStatus !== FaceVerificationStatus.VERIFIED || target.faceVerificationStatus !== FaceVerificationStatus.VERIFIED)
    ) {
      throw new ForbiddenException("Both members must be verified before messaging.");
    }

    if (
      !isProfileSetupComplete({ profile: sender.profile, photos: sender.photos }) ||
      !isProfileSetupComplete({ profile: target.profile, photos: target.photos }) ||
      !sender.profile?.birthDate ||
      !sender.profile.discoveryGender ||
      !sender.profile.connectionStatus ||
      !sender.discoveryPreference?.confirmedAt ||
      sender.discoveryPreference.interestedInGenders.length === 0 ||
      !target.profile?.birthDate ||
      !target.profile.discoveryGender ||
      !target.profile.connectionStatus ||
      !target.discoveryPreference?.confirmedAt ||
      target.discoveryPreference.interestedInGenders.length === 0
    ) {
      throw new ForbiddenException("Both members need complete discovery profiles before messaging.");
    }

    if (sender.profile.connectionStatus !== target.profile.connectionStatus) {
      throw new ForbiddenException("This member’s discovery status has changed.");
    }

    if (!areDiscoveryProfilesCompatible({
      birthDate: sender.profile.birthDate,
      discoveryGender: sender.profile.discoveryGender,
      interestedInGenders: sender.discoveryPreference.interestedInGenders,
      minAge: sender.discoveryPreference.minAge,
      maxAge: sender.discoveryPreference.maxAge
    }, {
      birthDate: target.profile.birthDate,
      discoveryGender: target.profile.discoveryGender,
      interestedInGenders: target.discoveryPreference.interestedInGenders,
      minAge: target.discoveryPreference.minAge,
      maxAge: target.discoveryPreference.maxAge
    }, now)) {
      throw new ForbiddenException("This profile is no longer available in your discovery preferences.");
    }

    if (sender.profile.state?.trim().toLowerCase() !== target.profile.state?.trim().toLowerCase()) {
      throw new ForbiddenException("This profile is outside your selected state.");
    }
  }

  private ensureDifferentUsers(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("You cannot message your own profile.");
    }
  }

  private getConversationPair(userId: string, targetUserId: string) {
    const [userAId, userBId] = [userId, targetUserId].sort();
    return { userAId, userBId };
  }

  private getConnectionStatusSnapshot(
    pair: { userAId: string; userBId: string },
    senderId: string,
    senderStatus: ConnectionStatus,
    targetStatus: ConnectionStatus
  ) {
    return {
      userAConnectionStatusAtMatch: pair.userAId === senderId ? senderStatus : targetStatus,
      userBConnectionStatusAtMatch: pair.userBId === senderId ? senderStatus : targetStatus
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
