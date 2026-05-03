import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SubscriptionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoomDto } from "./dto/create-room.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";

const ROOM_MESSAGE_HISTORY_LIMIT = 100;

type RoomSource = {
  id: string;
  name: string;
  description: string | null;
  city: string;
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
  }>;
};

type RoomMessageSource = {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
  author: {
    id: string;
    displayName: string;
  };
};

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminRooms() {
    const rooms = await this.prisma.chatRoom.findMany({
      include: this.roomCounts(),
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }]
    });

    return {
      rooms: rooms.map((room) => this.formatRoom(room))
    };
  }

  async createRoom(adminId: string, dto: CreateRoomDto) {
    const room = await this.prisma.chatRoom.create({
      data: {
        name: this.cleanText(dto.name),
        city: this.cleanText(dto.city),
        category: this.cleanText(dto.category),
        description: this.cleanOptionalText(dto.description),
        isActive: dto.isActive ?? true,
        createdById: adminId
      },
      include: this.roomCounts()
    });

    return this.formatRoom(room);
  }

  async updateRoom(roomId: string, dto: UpdateRoomDto) {
    await this.assertRoomExists(roomId);

    const room = await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: {
        ...(dto.name !== undefined ? { name: this.cleanText(dto.name) } : {}),
        ...(dto.city !== undefined ? { city: this.cleanText(dto.city) } : {}),
        ...(dto.category !== undefined ? { category: this.cleanText(dto.category) } : {}),
        ...(dto.description !== undefined ? { description: this.cleanOptionalText(dto.description) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      },
      include: this.roomCounts()
    });

    return this.formatRoom(room);
  }

  async getActiveRooms(userId: string) {
    const user = await this.ensureMemberOrAdmin(userId);

    const rooms = await this.prisma.chatRoom.findMany({
      where: { isActive: true },
      include: {
        ...this.roomCounts(),
        memberships:
          user.role === UserRole.ADMIN
            ? false
            : {
                where: { userId },
                select: { id: true },
                take: 1
              }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    return {
      rooms: rooms.map((room) => this.formatRoom(room))
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
        author: {
          select: {
            id: true,
            displayName: true
          }
        }
      },
      orderBy: { createdAt: "asc" },
      take: ROOM_MESSAGE_HISTORY_LIMIT
    });

    return {
      messages: messages.map((message) => this.formatMessage(message))
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
          userId
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
        author: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });

    return this.formatMessage(message);
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
        subscriptionEndsAt: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
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
      throw new ForbiddenException("Active Streetz membership required.");
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

  private formatRoom(room: RoomSource) {
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      city: room.city,
      category: room.category,
      isActive: room.isActive,
      memberCount: room._count?.memberships ?? 0,
      messageCount: room._count?.messages ?? 0,
      hasJoined: Boolean(room.memberships?.length),
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    };
  }

  private formatMessage(message: RoomMessageSource) {
    return {
      id: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorName: message.author.displayName,
      body: message.body,
      deletedAt: message.deletedAt,
      createdAt: message.createdAt
    };
  }

  private roomCounts() {
    return {
      _count: {
        select: {
          memberships: true,
          messages: true
        }
      }
    };
  }
}
