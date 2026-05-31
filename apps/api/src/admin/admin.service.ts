import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AccountStatus,
  EventStatus,
  MatchStatus,
  ModerationActionType,
  PaymentPurpose,
  PaymentStatus,
  ReportStatus,
  SubscriptionStatus,
  UserRole
} from "@prisma/client";
import { calculateAge } from "../common/age";
import { getActiveTicketWhere } from "../events/ticket-reservations";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { UsersService } from "../users/users.service";
import { ModerateReportUserDto } from "./dto/moderate-report-user.dto";

type AdminReportPhotoForFormat = {
  id: string;
  url: string;
  objectKey?: string | null;
  thumbUrl?: string | null;
  thumbObjectKey?: string | null;
  cardUrl?: string | null;
  cardObjectKey?: string | null;
  fullUrl?: string | null;
  fullObjectKey?: string | null;
  blurDataUrl?: string | null;
  sortOrder: number;
};

type AdminReportForFormat = {
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  reporter: {
    id: string;
    displayName: string;
    email: string;
    subscriptionStatus: SubscriptionStatus;
    accountStatus: AccountStatus;
    suspendedUntil: Date | null;
    deactivatedAt: Date | null;
    deletedAt: Date | null;
    moderationReason: string | null;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      city: string | null;
      state: string | null;
      connectionStatus: string | null;
      interests: string[];
    } | null;
    photos: AdminReportPhotoForFormat[];
  };
  reported: {
    id: string;
    displayName: string;
    email: string;
    subscriptionStatus: SubscriptionStatus;
    accountStatus: AccountStatus;
    suspendedUntil: Date | null;
    deactivatedAt: Date | null;
    deletedAt: Date | null;
    moderationReason: string | null;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      city: string | null;
      state: string | null;
      connectionStatus: string | null;
      interests: string[];
    } | null;
    photos: AdminReportPhotoForFormat[];
  };
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly usersService: UsersService
  ) {}

  async getMetrics() {
    const now = new Date();

    const [
      totalMembers,
      activeSubscribers,
      completedProfiles,
      activeMatches,
      totalRooms,
      roomMembers,
      roomMessages,
      publishedEvents,
      ticketsBooked,
      ticketRevenue,
      totalReports,
      openReports
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          role: UserRole.USER,
          accountStatus: { not: AccountStatus.DELETED }
        }
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.USER,
          accountStatus: AccountStatus.ACTIVE,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionEndsAt: { gt: now }
        }
      }),
      this.prisma.profile.count({
        where: {
          bio: { not: null },
          birthDate: { not: null },
          connectionStatus: { not: null },
          city: { not: null },
          state: { not: null },
          interests: { isEmpty: false },
          user: {
            role: UserRole.USER,
            accountStatus: AccountStatus.ACTIVE,
            photos: { some: {} }
          }
        }
      }),
      this.prisma.match.count({
        where: { status: MatchStatus.ACTIVE }
      }),
      this.prisma.chatRoom.count(),
      this.prisma.roomMembership.count(),
      this.prisma.chatMessage.count({
        where: { deletedAt: null }
      }),
      this.prisma.event.count({
        where: { status: EventStatus.PUBLISHED }
      }),
      this.prisma.ticket.count({
        where: getActiveTicketWhere(now)
      }),
      this.prisma.payment.aggregate({
        _sum: { amountKobo: true },
        where: {
          purpose: PaymentPurpose.EVENT_TICKET,
          status: PaymentStatus.SUCCESS
        }
      }),
      this.prisma.userReport.count(),
      this.prisma.userReport.count({
        where: { status: ReportStatus.OPEN }
      })
    ]);

    return {
      members: {
        total: totalMembers,
        activeSubscribers,
        completedProfiles
      },
      discovery: {
        activeMatches
      },
      rooms: {
        total: totalRooms,
        members: roomMembers,
        messages: roomMessages
      },
      events: {
        published: publishedEvents,
        ticketsBooked,
        ticketRevenueKobo: ticketRevenue._sum.amountKobo ?? 0
      },
      reports: {
        total: totalReports,
        open: openReports
      }
    };
  }

  async getReports() {
    const reports = await this.prisma.userReport.findMany({
      include: this.reportInclude(),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100
    });

    return {
      reports: await Promise.all(reports.map((report) => this.formatReport(report)))
    };
  }

  async getReport(reportId: string) {
    return this.getReportResponse(reportId);
  }

  async updateReportStatus(reportId: string, status: ReportStatus) {
    if (status !== ReportStatus.DISMISSED) {
      throw new BadRequestException("Report status is updated by moderation actions.");
    }

    const existingReport = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      select: { status: true }
    });

    if (!existingReport) {
      throw new NotFoundException("Report not found.");
    }

    if (existingReport.status === ReportStatus.ACTIONED) {
      throw new BadRequestException("Actioned reports cannot be dismissed.");
    }

    const report = await this.prisma.userReport
      .update({
        where: { id: reportId },
        data: { status },
        include: this.reportInclude()
      })
      .catch(() => null);

    if (!report) {
      throw new NotFoundException("Report not found.");
    }

    return {
      report: await this.formatReport(report)
    };
  }

  async moderateReportedUser(adminId: string, reportId: string, dto: ModerateReportUserDto) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        reportedId: true,
        reported: {
          select: {
            accountStatus: true
          }
        }
      }
    });

    if (!report) {
      throw new NotFoundException("Report not found.");
    }

    const reason = this.cleanOptionalText(dto.reason);
    const now = new Date();
    let expiresAt: Date | null = null;

    if (dto.action === ModerationActionType.DELETE) {
      await this.usersService.softDeleteAccount(report.reportedId, {
        adminId,
        reportId,
        reason
      });
      await this.prisma.userReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.ACTIONED }
      });

      return this.getReportResponse(reportId, {
        action: dto.action,
        expiresAt: null
      });
    }

    if (
      dto.action !== ModerationActionType.SUSPEND &&
      dto.action !== ModerationActionType.BAN &&
      dto.action !== ModerationActionType.RESTORE
    ) {
      throw new BadRequestException("This moderation action is not supported from reports.");
    }

    if (dto.action === ModerationActionType.RESTORE && report.reported.accountStatus === AccountStatus.DELETED) {
      throw new ForbiddenException("Deleted accounts cannot be restored from the admin panel.");
    }

    if (
      dto.action === ModerationActionType.RESTORE &&
      report.reported.accountStatus !== AccountStatus.SUSPENDED &&
      report.reported.accountStatus !== AccountStatus.BANNED
    ) {
      throw new BadRequestException("Only suspended or banned accounts can be restored from reports.");
    }

    const userData =
      dto.action === ModerationActionType.SUSPEND
        ? (() => {
            const durationDays = dto.durationDays ?? 7;
            expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + durationDays);

            return {
              accountStatus: AccountStatus.SUSPENDED,
              suspendedUntil: expiresAt,
              deactivatedAt: null,
              moderationReason: reason
            };
          })()
        : dto.action === ModerationActionType.BAN
          ? {
              accountStatus: AccountStatus.BANNED,
              suspendedUntil: null,
              deactivatedAt: null,
              moderationReason: reason
            }
          : {
              accountStatus: AccountStatus.ACTIVE,
              suspendedUntil: null,
              deactivatedAt: null,
              deletedAt: null,
              moderationReason: null
            };

    const reportStatus = dto.action === ModerationActionType.RESTORE ? ReportStatus.REVIEWED : ReportStatus.ACTIONED;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: report.reportedId },
        data: userData
      }),
      this.prisma.profile.updateMany({
        where: { userId: report.reportedId },
        data: { discoveryLive: dto.action === ModerationActionType.RESTORE }
      }),
      this.prisma.moderationAction.create({
        data: {
          adminId,
          targetUserId: report.reportedId,
          reportId,
          action: dto.action,
          reason,
          expiresAt
        }
      }),
      this.prisma.userReport.update({
        where: { id: reportId },
        data: { status: reportStatus }
      })
    ]);

    return this.getReportResponse(reportId, {
      action: dto.action,
      expiresAt
    });
  }

  async getUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        accountStatus: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        moderationReason: true,
        createdAt: true,
        profile: {
          select: {
            city: true,
            state: true,
            connectionStatus: true,
            discoveryLive: true
          }
        },
        _count: {
          select: {
            matchesA: true,
            matchesB: true,
            tickets: true,
            roomMemberships: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt,
        moderationReason: user.moderationReason,
        createdAt: user.createdAt,
        profile: user.profile,
        matchCount: user._count.matchesA + user._count.matchesB,
        ticketCount: user._count.tickets,
        roomCount: user._count.roomMemberships
      }))
    };
  }

  async getUserActivity(userId: string) {
    const LIMIT = 50;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        accountStatus: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        suspendedUntil: true,
        deactivatedAt: true,
        deletedAt: true,
        moderationReason: true,
        ageConfirmedAt: true,
        createdAt: true,
        profile: {
          select: {
            bio: true,
            birthDate: true,
            gender: true,
            sexuality: true,
            connectionStatus: true,
            city: true,
            state: true,
            interests: true,
            discoveryLive: true,
            maxDistanceKm: true,
            locationUpdatedAt: true
          }
        },
        photos: { select: { id: true } }
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const [
      payments,
      discoveryActions,
      receivedActions,
      matchesA,
      matchesB,
      roomMemberships,
      tickets,
      moderationActions,
      loginSessions
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId },
        select: {
          id: true,
          purpose: true,
          status: true,
          amountKobo: true,
          provider: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT
      }),
      this.prisma.discoveryActionLog.findMany({
        where: { actorId: userId },
        select: {
          targetId: true,
          action: true,
          createdAt: true,
          target: { select: { displayName: true } }
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT
      }),
      this.prisma.discoveryActionLog.findMany({
        where: { targetId: userId },
        select: {
          actorId: true,
          action: true,
          createdAt: true,
          actor: { select: { displayName: true } }
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT
      }),
      this.prisma.match.findMany({
        where: { userAId: userId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          userB: { select: { id: true, displayName: true } }
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT
      }),
      this.prisma.match.findMany({
        where: { userBId: userId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          userA: { select: { id: true, displayName: true } }
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT
      }),
      this.prisma.roomMembership.findMany({
        where: { userId },
        select: {
          joinedAt: true,
          room: { select: { id: true, name: true, category: true } }
        },
        orderBy: { joinedAt: "desc" },
        take: LIMIT
      }),
      this.prisma.ticket.findMany({
        where: { userId },
        select: {
          id: true,
          code: true,
          status: true,
          checkedInAt: true,
          createdAt: true,
          event: { select: { id: true, title: true } },
          ticketType: { select: { name: true, priceKobo: true } }
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT
      }),
      this.prisma.moderationAction.findMany({
        where: { targetUserId: userId },
        select: {
          action: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
          admin: { select: { displayName: true } }
        },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.refreshToken.findMany({
        where: { userId },
        select: { createdAt: true, expiresAt: true, revokedAt: true },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);

    const allMatches = [
      ...matchesA.map((m) => ({
        id: m.id,
        otherUserId: m.userB.id,
        otherUserName: m.userB.displayName,
        status: m.status,
        createdAt: m.createdAt
      })),
      ...matchesB.map((m) => ({
        id: m.id,
        otherUserId: m.userA.id,
        otherUserName: m.userA.displayName,
        status: m.status,
        createdAt: m.createdAt
      }))
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, LIMIT);

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt,
        suspendedUntil: user.suspendedUntil,
        deactivatedAt: user.deactivatedAt,
        deletedAt: user.deletedAt,
        moderationReason: user.moderationReason,
        ageConfirmedAt: user.ageConfirmedAt,
        createdAt: user.createdAt,
        profile: user.profile,
        photoCount: user.photos.length,
        payments: payments.map((p) => ({
          id: p.id,
          purpose: p.purpose,
          status: p.status,
          amountKobo: p.amountKobo,
          provider: p.provider,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        })),
        discoveryActions: discoveryActions.map((a) => ({
          targetId: a.targetId,
          targetName: a.target.displayName,
          action: a.action,
          createdAt: a.createdAt
        })),
        receivedActions: receivedActions.map((a) => ({
          actorId: a.actorId,
          actorName: a.actor.displayName,
          action: a.action,
          createdAt: a.createdAt
        })),
        matches: allMatches,
        roomMemberships: roomMemberships.map((m) => ({
          roomId: m.room.id,
          roomName: m.room.name,
          roomCategory: m.room.category,
          joinedAt: m.joinedAt
        })),
        tickets: tickets.map((t) => ({
          id: t.id,
          code: t.code,
          eventId: t.event.id,
          eventTitle: t.event.title,
          ticketTypeName: t.ticketType.name,
          priceKobo: t.ticketType.priceKobo,
          status: t.status,
          checkedInAt: t.checkedInAt,
          createdAt: t.createdAt
        })),
        moderationActions: moderationActions.map((m) => ({
          action: m.action,
          reason: m.reason,
          expiresAt: m.expiresAt,
          adminName: m.admin?.displayName ?? null,
          createdAt: m.createdAt
        })),
        loginSessions: loginSessions.map((s) => ({
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          revokedAt: s.revokedAt
        }))
      }
    };
  }

  private async getReportResponse(reportId: string, action?: { action: ModerationActionType; expiresAt: Date | null }) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      include: this.reportInclude()
    });

    if (!report) {
      throw new NotFoundException("Report not found.");
    }

    return {
      report: await this.formatReport(report),
      ...(action ? { action } : {})
    };
  }

  private async formatReportUser(user: {
    id: string;
    displayName: string;
    email: string;
    subscriptionStatus: SubscriptionStatus;
    accountStatus: AccountStatus;
    suspendedUntil: Date | null;
    deactivatedAt: Date | null;
    deletedAt: Date | null;
    moderationReason: string | null;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      city: string | null;
      state: string | null;
      connectionStatus: string | null;
      interests: string[];
    } | null;
    photos: AdminReportPhotoForFormat[];
  }) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
      accountStatus: user.accountStatus,
      suspendedUntil: user.suspendedUntil,
      deactivatedAt: user.deactivatedAt,
      deletedAt: user.deletedAt,
      moderationReason: user.moderationReason,
      age: user.profile?.birthDate ? calculateAge(user.profile.birthDate) : null,
      bio: user.profile?.bio ?? null,
      city: user.profile?.city ?? null,
      state: user.profile?.state ?? null,
      connectionStatus: user.profile?.connectionStatus ?? null,
      interests: user.profile?.interests ?? [],
      photos: await this.storage.signPhotoUrls(user.photos)
    };
  }

  private reportInclude() {
    return {
      reporter: {
        select: {
          id: true,
          displayName: true,
          email: true,
          subscriptionStatus: true,
          accountStatus: true,
          suspendedUntil: true,
          deactivatedAt: true,
          deletedAt: true,
          moderationReason: true,
          profile: {
            select: {
              bio: true,
              birthDate: true,
              city: true,
              state: true,
              connectionStatus: true,
              interests: true
            }
          },
          photos: {
            orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
            take: 6
          }
        }
      },
      reported: {
        select: {
          id: true,
          displayName: true,
          email: true,
          subscriptionStatus: true,
          accountStatus: true,
          suspendedUntil: true,
          deactivatedAt: true,
          deletedAt: true,
          moderationReason: true,
          profile: {
            select: {
              bio: true,
              birthDate: true,
              city: true,
              state: true,
              connectionStatus: true,
              interests: true
            }
          },
          photos: {
            orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
            take: 6
          }
        }
      }
    };
  }

  private async formatReport(report: AdminReportForFormat) {
    return {
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      reporter: await this.formatReportUser(report.reporter),
      reported: await this.formatReportUser(report.reported)
    };
  }

  private cleanOptionalText(value: string | null | undefined) {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
  }

}
