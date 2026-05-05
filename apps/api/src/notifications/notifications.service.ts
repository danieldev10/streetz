import { Injectable } from "@nestjs/common";
import { MatchStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === UserRole.ADMIN) {
      return {
        matchesUnreadCount: 0,
        roomsUnreadCount: 0,
        totalUnreadCount: 0
      };
    }

    const [matchesUnreadCount, roomsUnreadCount] = await Promise.all([
      this.getUnreadDirectMessageCount(userId),
      this.getUnreadRoomMessageCount(userId)
    ]);

    return {
      matchesUnreadCount,
      roomsUnreadCount,
      totalUnreadCount: matchesUnreadCount + roomsUnreadCount
    };
  }

  private async getUnreadDirectMessageCount(userId: string) {
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
      matches.map((match) =>
        this.prisma.directMessage.count({
          where: {
            matchId: match.id,
            senderId: { not: userId },
            ...(match.readStates[0]?.lastReadAt ? { createdAt: { gt: match.readStates[0].lastReadAt } } : {})
          }
        })
      )
    );

    return counts.reduce((total, count) => total + count, 0);
  }

  private async getUnreadRoomMessageCount(userId: string) {
    const memberships = await this.prisma.roomMembership.findMany({
      where: {
        userId,
        room: {
          isActive: true
        }
      },
      select: {
        roomId: true,
        lastReadAt: true
      }
    });

    const counts = await Promise.all(
      memberships.map((membership) =>
        this.prisma.chatMessage.count({
          where: {
            roomId: membership.roomId,
            authorId: { not: userId },
            deletedAt: null,
            createdAt: { gt: membership.lastReadAt }
          }
        })
      )
    );

    return counts.reduce((total, count) => total + count, 0);
  }
}
