import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, ConnectionStatus, Gender, Prisma, Sexuality, SubscriptionStatus, UserRole } from "@prisma/client";
import { calculateAge } from "../common/age";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { getAccountAccessBlock } from "../users/account-status";
import { CreateRoomDto } from "./dto/create-room.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";

const ROOM_MESSAGE_HISTORY_LIMIT = 100;

type RoomSource = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    memberships?: number;
    messages?: number;
  };
  memberships?: Array<{
    id: string;
    userId?: string;
    lastReadAt?: Date;
  }>;
};

type RoomMessageSource = {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  author: CandidateUser;
};

type CandidateUser = {
  id: string;
  displayName: string;
  accountStatus: AccountStatus;
  profile: {
    bio: string | null;
    birthDate: Date | null;
    gender: Gender | null;
    sexuality: Sexuality | null;
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

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getAdminRooms() {
    const rooms = await this.prisma.chatRoom.findMany({
      include: this.roomCounts({ includeMessages: true }),
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }]
    });

    return {
      rooms: await Promise.all(rooms.map((room) => this.formatRoom(room, { includeMessageCount: true })))
    };
  }

  async createRoom(adminId: string, dto: CreateRoomDto) {
    const room = await this.prisma.chatRoom.create({
      data: {
        name: this.cleanText(dto.name),
        category: this.cleanText(dto.category),
        description: this.cleanOptionalText(dto.description),
        isActive: dto.isActive ?? true,
        createdById: adminId
      },
      include: this.roomCounts({ includeMessages: true })
    });

    return this.formatRoom(room, { includeMessageCount: true });
  }

  async updateRoom(roomId: string, dto: UpdateRoomDto) {
    await this.assertRoomExists(roomId);

    const room = await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: {
        ...(dto.name !== undefined ? { name: this.cleanText(dto.name) } : {}),
        ...(dto.category !== undefined ? { category: this.cleanText(dto.category) } : {}),
        ...(dto.description !== undefined ? { description: this.cleanOptionalText(dto.description) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      },
      include: this.roomCounts({ includeMessages: true })
    });

    return this.formatRoom(room, { includeMessageCount: true });
  }

  async getActiveRooms(userId: string) {
    const user = await this.ensureMemberOrAdmin(userId);

    const rooms = await this.prisma.chatRoom.findMany({
      where: { isActive: true },
      include: {
        ...this.roomCounts({ includeMessages: user.role === UserRole.ADMIN }),
        memberships:
          user.role === UserRole.ADMIN
            ? false
            : {
                where: { userId },
                select: { id: true, userId: true, lastReadAt: true },
                take: 1
              }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    return {
      rooms: await Promise.all(rooms.map((room) => this.formatRoom(room, { includeMessageCount: user.role === UserRole.ADMIN })))
    };
  }

  async getRoomMessages(userId: string, roomId: string) {
    await this.assertRoomParticipant(userId, roomId);

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        deletedAt: null
      },
      include: {
        author: this.userInclude()
      },
      orderBy: { createdAt: "desc" },
      take: ROOM_MESSAGE_HISTORY_LIMIT
    });
    const orderedMessages = [...messages].reverse();

    await this.markRoomRead(userId, roomId);

    return {
      messages: await Promise.all(orderedMessages.map((message) => this.formatMessage(message)))
    };
  }

  async getRoomMembers(userId: string, roomId: string) {
    await this.assertRoomParticipant(userId, roomId);

    const memberships = await this.prisma.roomMembership.findMany({
      where: {
        roomId,
        user: {
          accountStatus: { not: AccountStatus.DELETED }
        }
      },
      include: {
        user: this.userInclude()
      },
      orderBy: { joinedAt: "asc" }
    });

    return {
      members: await Promise.all(
        memberships.map(async (membership) => ({
          ...(await this.formatCandidate(membership.user)),
          joinedAt: membership.joinedAt
        }))
      )
    };
  }

  async joinRoom(userId: string, roomId: string) {
    const user = await this.assertActiveRoomAccess(userId, roomId);

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException("Admins can view rooms but cannot join as members.");
    }

    try {
      await this.prisma.roomMembership.create({
        data: {
          roomId,
          userId,
          lastReadAt: new Date()
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
    }

    return {
      ok: true,
      roomId
    };
  }

  async markRoomRead(userId: string, roomId: string) {
    const user = await this.assertRoomParticipant(userId, roomId);

    if (user.role === UserRole.ADMIN) {
      return {
        ok: true,
        roomId,
        unreadCount: 0
      };
    }

    await this.prisma.roomMembership.update({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      },
      data: {
        lastReadAt: new Date()
      }
    });

    return {
      ok: true,
      roomId,
      unreadCount: 0
    };
  }

  async leaveRoom(userId: string, roomId: string) {
    const user = await this.ensureMemberOrAdmin(userId);

    if (user.role === UserRole.ADMIN) {
      return {
        ok: true,
        roomId
      };
    }

    await this.prisma.roomMembership.deleteMany({
      where: {
        roomId,
        userId
      }
    });

    return {
      ok: true,
      roomId
    };
  }

  async createRoomMessage(userId: string, roomId: string, rawBody: string) {
    const user = await this.assertRoomParticipant(userId, roomId);

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException("Admins can view rooms but cannot send room messages.");
    }

    const body = rawBody.trim();

    if (!body) {
      throw new BadRequestException("Message cannot be empty.");
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        authorId: userId,
        body
      },
      include: {
        author: this.userInclude()
      }
    });
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: message.createdAt }
    });

    await this.markRoomRead(userId, roomId);

    return this.formatMessage(message);
  }

  async getUnreadRoomMessageCount(userId: string) {
    const user = await this.ensureMemberOrAdmin(userId);

    if (user.role === UserRole.ADMIN) {
      return 0;
    }

    const memberships = await this.prisma.roomMembership.findMany({
      where: {
        userId,
        room: {
          isActive: true
        }
      },
      select: {
        roomId: true,
        userId: true,
        lastReadAt: true
      }
    });

    const counts = await Promise.all(
      memberships.map((membership) => this.countUnreadRoomMessages(membership.roomId, membership.userId, membership.lastReadAt))
    );

    return counts.reduce((total, count) => total + count, 0);
  }

  async getRoomMemberUserIds(roomId: string) {
    const memberships = await this.prisma.roomMembership.findMany({
      where: { roomId },
      select: { userId: true }
    });

    return memberships.map((membership) => membership.userId);
  }

  getSocketRoomName(roomId: string) {
    return `room:${roomId}`;
  }

  private async assertActiveRoomAccess(userId: string, roomId: string) {
    const user = await this.ensureMemberOrAdmin(userId);

    const room = await this.prisma.chatRoom.findFirst({
      where: {
        id: roomId,
        isActive: true
      },
      select: {
        id: true
      }
    });

    if (!room) {
      throw new ForbiddenException("This room is not available.");
    }

    return user;
  }

  async assertRoomParticipant(userId: string, roomId: string) {
    const user = await this.assertActiveRoomAccess(userId, roomId);

    if (user.role === UserRole.ADMIN) {
      return user;
    }

    const membership = await this.prisma.roomMembership.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      },
      select: {
        id: true
      }
    });

    if (!membership) {
      throw new ForbiddenException("Join this room before opening the chat.");
    }

    return user;
  }

  private async assertRoomExists(roomId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { id: true }
    });

    if (!room) {
      throw new NotFoundException("Room not found.");
    }
  }

  private async ensureMemberOrAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
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

    if (user.role === UserRole.ADMIN) {
      return user;
    }

    const subscriptionEndsAt = user.subscriptionEndsAt;

    if (
      user.subscriptionStatus !== SubscriptionStatus.ACTIVE ||
      subscriptionEndsAt === null ||
      subscriptionEndsAt <= new Date()
    ) {
      throw new ForbiddenException("Active crushclub membership required.");
    }

    return user;
  }

  private cleanText(value: string) {
    return value.trim();
  }

  private cleanOptionalText(value: string | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
  }

  private async formatRoom(room: RoomSource, options: { includeMessageCount: boolean }) {
    const membership = room.memberships?.[0];
    const unreadCount =
      membership?.userId && membership.lastReadAt
        ? await this.countUnreadRoomMessages(room.id, membership.userId, membership.lastReadAt)
        : 0;

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      category: room.category,
      isActive: room.isActive,
      memberCount: room._count?.memberships ?? 0,
      ...(options.includeMessageCount ? { messageCount: room._count?.messages ?? 0 } : {}),
      ...(membership ? { unreadCount } : {}),
      hasJoined: Boolean(room.memberships?.length),
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    };
  }

  private async formatMessage(message: RoomMessageSource) {
    return {
      id: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorName: message.author.displayName,
      author: await this.formatCandidate(message.author),
      body: message.body,
      createdAt: message.createdAt
    };
  }

  private async formatCandidate(candidate: CandidateUser) {
    return {
      id: candidate.id,
      displayName: candidate.displayName,
      accountStatus: candidate.accountStatus,
      age: candidate.profile?.birthDate ? calculateAge(candidate.profile.birthDate) : null,
      bio: candidate.profile?.bio ?? null,
      gender: candidate.profile?.gender ?? null,
      sexuality: candidate.profile?.sexuality ?? null,
      connectionStatus: candidate.profile?.connectionStatus ?? null,
      city: candidate.profile?.city ?? null,
      state: candidate.profile?.state ?? null,
      interests: candidate.profile?.interests ?? [],
      photos: await this.storage.signPhotoUrls(candidate.photos)
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

  private roomCounts(options: { includeMessages: boolean }) {
    return {
      _count: {
        select: {
          memberships: true,
          ...(options.includeMessages ? { messages: true } : {})
        }
      }
    };
  }

  private countUnreadRoomMessages(roomId: string, userId: string, lastReadAt: Date) {
    return this.prisma.chatMessage.count({
      where: {
        roomId,
        authorId: { not: userId },
        deletedAt: null,
        createdAt: { gt: lastReadAt }
      }
    });
  }
}
