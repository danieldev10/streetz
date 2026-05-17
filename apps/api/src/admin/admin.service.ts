import { Injectable, NotFoundException } from "@nestjs/common";
import {
  EventStatus,
  MatchStatus,
  PaymentPurpose,
  PaymentStatus,
  ReportStatus,
  SubscriptionStatus,
  TicketStatus,
  UserRole
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const now = new Date();
    const activeTicketStatuses: TicketStatus[] = [TicketStatus.RESERVED, TicketStatus.PAID, TicketStatus.CHECKED_IN];

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
        where: { role: UserRole.USER }
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.USER,
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
        where: { status: { in: activeTicketStatuses } }
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
      include: {
        reporter: {
          select: {
            id: true,
            displayName: true,
            email: true,
            profile: {
              select: {
                city: true,
                state: true,
                connectionStatus: true
              }
            }
          }
        },
        reported: {
          select: {
            id: true,
            displayName: true,
            email: true,
            subscriptionStatus: true,
            profile: {
              select: {
                city: true,
                state: true,
                connectionStatus: true
              }
            }
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100
    });

    return {
      reports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        reporter: this.formatReportUser(report.reporter),
        reported: {
          ...this.formatReportUser(report.reported),
          subscriptionStatus: report.reported.subscriptionStatus
        }
      }))
    };
  }

  async updateReportStatus(reportId: string, status: ReportStatus) {
    const report = await this.prisma.userReport
      .update({
        where: { id: reportId },
        data: { status },
        include: {
          reporter: {
            select: {
              id: true,
              displayName: true,
              email: true,
              profile: {
                select: {
                  city: true,
                  state: true,
                  connectionStatus: true
                }
              }
            }
          },
          reported: {
            select: {
              id: true,
              displayName: true,
              email: true,
              subscriptionStatus: true,
              profile: {
                select: {
                  city: true,
                  state: true,
                  connectionStatus: true
                }
              }
            }
          }
        }
      })
      .catch(() => null);

    if (!report) {
      throw new NotFoundException("Report not found.");
    }

    return {
      report: {
        id: report.id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        reporter: this.formatReportUser(report.reporter),
        reported: {
          ...this.formatReportUser(report.reported),
          subscriptionStatus: report.reported.subscriptionStatus
        }
      }
    };
  }

  private formatReportUser(user: {
    id: string;
    displayName: string;
    email: string;
    profile: {
      city: string | null;
      state: string | null;
      connectionStatus: string | null;
    } | null;
  }) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      city: user.profile?.city ?? null,
      state: user.profile?.state ?? null,
      connectionStatus: user.profile?.connectionStatus ?? null
    };
  }
}
