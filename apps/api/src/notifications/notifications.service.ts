import { Injectable } from "@nestjs/common";
import {
  AccountStatus,
  ConnectionStatus,
  DiscoveryAction,
  EventStatus,
  MatchStatus,
  NotificationKind,
  PaymentPurpose,
  PaymentStatus,
  ReportStatus,
  SubscriptionStatus,
  UserRole
} from "@prisma/client";
import { calculateAge } from "../common/age";
import { CONFIRMED_TICKET_STATUSES, getActiveTicketWhere } from "../events/ticket-reservations";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { MarkNotificationsSeenDto } from "./dto/mark-notifications-seen.dto";

const FEED_LIKES_LIMIT = 20;
const FEED_MATCHES_LIMIT = 10;
const FEED_DIRECT_MESSAGES_LIMIT = 10;
const FEED_ROOM_MESSAGES_LIMIT = 10;
const FEED_ROOMS_LIMIT = 10;
const FEED_EVENTS_LIMIT = 10;
const FEED_TICKETS_LIMIT = 10;
const FEED_EVENT_ALERTS_LIMIT = 10;
const FEED_REPORT_UPDATES_LIMIT = 10;
const FEED_PAYMENT_ALERTS_LIMIT = 10;
const FEED_ROOMS_RECENCY_DAYS = 30;
const SUBSCRIPTION_EXPIRING_DAYS = 7;
const EVENT_REMINDER_HOURS = 48;
const FAILED_PAYMENT_STATUSES = [PaymentStatus.FAILED, PaymentStatus.ABANDONED, PaymentStatus.REVERSED];

type PendingLikeQueryContext = {
  connectionStatus: ConnectionStatus;
  excludedIds: Set<string>;
  now: Date;
};

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
    blurDataUrl?: string | null;
    sortOrder: number;
  }>;
};

type DirectMessageSource = {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    displayName: string;
  };
};

type RoomMessageSource = {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    displayName: string;
  };
};

type EventAlertSource = {
  id: string;
  title: string;
  venue: string;
  state: string | null;
  city: string;
  startsAt: Date;
  cancellationReason?: string | null;
  updatedAt: Date;
};

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, createdAt: true }
    });

    if (user?.role === UserRole.ADMIN) {
      return {
        matchesUnreadCount: 0,
        roomsUnreadCount: 0,
        notificationsUnreadCount: 0,
        totalUnreadCount: 0
      };
    }

    const userCreatedAt = user?.createdAt ?? new Date(0);
    const [matchesUnreadCount, roomsUnreadCount, notificationsUnreadCount] = await Promise.all([
      this.getUnreadDirectMessageCount(userId),
      this.getUnreadRoomMessageCount(userId),
      this.getUnreadFeedNotificationCount(userId, userCreatedAt)
    ]);

    return {
      matchesUnreadCount,
      roomsUnreadCount,
      notificationsUnreadCount,
      totalUnreadCount: matchesUnreadCount + roomsUnreadCount + notificationsUnreadCount
    };
  }

  async getFeed(userId: string) {
    const userRecord = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true }
    });
    const userCreatedAt = userRecord?.createdAt ?? new Date(0);

    const [
      likes,
      matches,
      directMessages,
      roomMessages,
      rooms,
      events,
      tickets,
      eventAlerts,
      subscriptionAlerts,
      reportUpdates,
      paymentAlerts
    ] = await Promise.all([
      this.getPendingLikes(userId),
      this.getNewMatches(userId),
      this.getUnreadDirectMessageSummaries(userId),
      this.getUnreadRoomMessageSummaries(userId),
      this.getRecentRooms(userId, userCreatedAt),
      this.getUpcomingEvents(userId, userCreatedAt),
      this.getConfirmedTickets(userId),
      this.getEventAlerts(userId),
      this.getSubscriptionAlerts(userId),
      this.getReportUpdates(userId),
      this.getPaymentAlerts(userId)
    ]);

    return {
      likes,
      matches,
      directMessages,
      roomMessages,
      rooms,
      events,
      tickets,
      eventAlerts,
      subscriptionAlerts,
      reportUpdates,
      paymentAlerts
    };
  }

  async markFeedItemsSeen(userId: string, dto: MarkNotificationsSeenDto) {
    const seenAt = new Date();
    const uniqueItems = Array.from(
      new Map(
        dto.items
          .map((item) => ({
            kind: item.kind,
            entityId: item.entityId.trim()
          }))
          .filter((item) => item.entityId)
          .map((item) => [`${item.kind}:${item.entityId}`, item])
      ).values()
    );

    if (uniqueItems.length === 0) {
      return {
        ok: true,
        seenCount: 0
      };
    }

    await this.prisma.$transaction(
      uniqueItems.map((item) =>
        this.prisma.notificationSeen.upsert({
          where: {
            userId_kind_entityId: {
              userId,
              kind: item.kind,
              entityId: item.entityId
            }
          },
          create: {
            userId,
            kind: item.kind,
            entityId: item.entityId,
            seenAt
          },
          update: {
            seenAt
          }
        })
      )
    );

    return {
      ok: true,
      seenCount: uniqueItems.length
    };
  }

  private async getPendingLikes(userId: string) {
    const context = await this.getPendingLikeQueryContext(userId);

    if (!context) {
      return [];
    }

    const incomingLikes = await this.prisma.discoveryActionLog.findMany({
      where: this.getPendingLikeWhere(userId, context),
      include: {
        actor: this.candidateInclude(6)
      },
      orderBy: { createdAt: "desc" },
      take: FEED_LIKES_LIMIT
    });

    if (incomingLikes.length === 0) {
      return [];
    }

    return Promise.all(
      incomingLikes.map(async (like) => ({
        ...(await this.formatCandidate(like.actor)),
        likedAt: like.createdAt.toISOString()
      }))
    );
  }

  private async getNewMatches(userId: string) {
    const seenMatchIds = await this.getSeenEntityIds(userId, NotificationKind.MATCH_CREATED);
    const matches = await this.prisma.match.findMany({
      where: {
        id: { notIn: seenMatchIds },
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      include: {
        userA: this.candidateInclude(6),
        userB: this.candidateInclude(6)
      },
      orderBy: { createdAt: "desc" },
      take: FEED_MATCHES_LIMIT
    });

    return Promise.all(
      matches.map(async (match) => ({
        id: match.id,
        createdAt: match.createdAt.toISOString(),
        user: await this.formatCandidate(match.userAId === userId ? match.userB : match.userA)
      }))
    );
  }

  private async getUnreadDirectMessageSummaries(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }]
      },
      include: {
        userA: this.candidateInclude(1),
        userB: this.candidateInclude(1),
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

    const summaries = await Promise.all(
      matches.map(async (match) => {
        const lastMessage = match.messages[0] ?? null;
        const unreadCount = await this.countUnreadDirectMessages(match.id, userId, match.readStates[0]?.lastReadAt ?? null);

        if (unreadCount === 0 || !lastMessage) {
          return null;
        }

        return {
          id: match.id,
          matchId: match.id,
          user: await this.formatCandidate(match.userAId === userId ? match.userB : match.userA),
          lastMessage: this.formatDirectMessage(lastMessage),
          unreadCount,
          updatedAt: lastMessage.createdAt.toISOString()
        };
      })
    );

    return summaries
      .filter(isDefined)
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, FEED_DIRECT_MESSAGES_LIMIT);
  }

  private async getUnreadRoomMessageSummaries(userId: string) {
    const memberships = await this.prisma.roomMembership.findMany({
      where: {
        userId,
        room: {
          isActive: true
        }
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            category: true,
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                author: {
                  select: {
                    id: true,
                    displayName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const summaries = await Promise.all(
      memberships.map(async (membership) => {
        const lastMessage = membership.room.messages[0] ?? null;
        const unreadCount = await this.countUnreadRoomMessages(membership.roomId, userId, membership.lastReadAt);

        if (unreadCount === 0 || !lastMessage) {
          return null;
        }

        return {
          id: membership.roomId,
          roomId: membership.roomId,
          name: membership.room.name,
          category: membership.room.category,
          lastMessage: this.formatRoomMessage(lastMessage),
          unreadCount,
          updatedAt: lastMessage.createdAt.toISOString()
        };
      })
    );

    return summaries
      .filter(isDefined)
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, FEED_ROOM_MESSAGES_LIMIT);
  }

  private async getRecentRooms(userId: string, userCreatedAt: Date) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FEED_ROOMS_RECENCY_DAYS);
    const effectiveCutoff = userCreatedAt > cutoff ? userCreatedAt : cutoff;
    const seenRoomIds = await this.getSeenEntityIds(userId, NotificationKind.ROOM_CREATED);

    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        id: { notIn: seenRoomIds },
        isActive: true,
        createdAt: { gte: effectiveCutoff },
        memberships: {
          none: { userId }
        }
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        createdAt: true,
        _count: { select: { memberships: true } }
      },
      orderBy: { createdAt: "desc" },
      take: FEED_ROOMS_LIMIT
    });

    return rooms.map((room) => ({
      id: room.id,
      name: room.name,
      description: room.description,
      category: room.category,
      memberCount: room._count.memberships,
      createdAt: room.createdAt.toISOString()
    }));
  }

  private async getUpcomingEvents(userId: string, userCreatedAt: Date) {
    const now = new Date();
    const seenEventIds = await this.getSeenEntityIds(userId, NotificationKind.EVENT_PUBLISHED);

    const events = await this.prisma.event.findMany({
      where: {
        id: { notIn: seenEventIds },
        status: EventStatus.PUBLISHED,
        startsAt: { gt: now },
        createdAt: { gte: userCreatedAt },
        tickets: {
          none: {
            userId,
            ...getActiveTicketWhere(now)
          }
        }
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        coverImage: true,
        venue: true,
        state: true,
        city: true,
        startsAt: true,
        endsAt: true,
        createdAt: true
      },
      orderBy: { startsAt: "asc" },
      take: FEED_EVENTS_LIMIT
    });

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      coverImage: event.coverImage,
      venue: event.venue,
      state: event.state,
      city: event.city,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      createdAt: event.createdAt.toISOString()
    }));
  }

  private async getConfirmedTickets(userId: string) {
    const seenTicketIds = await this.getSeenEntityIds(userId, NotificationKind.TICKET_CONFIRMED);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        id: { notIn: seenTicketIds },
        userId,
        status: { in: CONFIRMED_TICKET_STATUSES }
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            venue: true,
            state: true,
            city: true,
            startsAt: true
          }
        },
        ticketType: {
          select: {
            id: true,
            name: true,
            priceKobo: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: FEED_TICKETS_LIMIT
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      code: ticket.code,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      event: {
        id: ticket.event.id,
        title: ticket.event.title,
        venue: ticket.event.venue,
        state: ticket.event.state,
        city: ticket.event.city,
        startsAt: ticket.event.startsAt.toISOString()
      },
      ticketType: {
        id: ticket.ticketType.id,
        name: ticket.ticketType.name,
        priceKobo: ticket.ticketType.priceKobo
      }
    }));
  }

  private async getEventAlerts(userId: string, limit = FEED_EVENT_ALERTS_LIMIT) {
    const now = new Date();
    const reminderWindow = new Date(now.getTime() + EVENT_REMINDER_HOURS * 60 * 60 * 1000);
    const [seenReminderIds, seenUpdatedIds, seenCancelledIds] = await Promise.all([
      this.getSeenEntityIds(userId, NotificationKind.EVENT_REMINDER),
      this.getSeenEntityIds(userId, NotificationKind.EVENT_UPDATED),
      this.getSeenEntityIds(userId, NotificationKind.EVENT_CANCELLED)
    ]);
    const [reminderTickets, updatedTickets, cancelledTickets] = await Promise.all([
      this.prisma.ticket.findMany({
        where: {
          userId,
          ...getActiveTicketWhere(now),
          event: {
            is: {
              status: EventStatus.PUBLISHED,
              startsAt: {
                gt: now,
                lte: reminderWindow
              }
            }
          }
        },
        include: { event: true },
        orderBy: { createdAt: "desc" },
        take: Math.max(limit * 3, FEED_EVENT_ALERTS_LIMIT)
      }),
      this.prisma.ticket.findMany({
        where: {
          userId,
          ...getActiveTicketWhere(now),
          event: {
            is: {
              status: EventStatus.PUBLISHED,
              startsAt: { gt: now }
            }
          }
        },
        include: { event: true },
        orderBy: { createdAt: "desc" },
        take: Math.max(limit * 3, FEED_EVENT_ALERTS_LIMIT)
      }),
      this.prisma.ticket.findMany({
        where: {
          userId,
          ...getActiveTicketWhere(now),
          event: {
            is: {
              status: EventStatus.CANCELLED
            }
          }
        },
        include: { event: true },
        orderBy: { createdAt: "desc" },
        take: Math.max(limit * 3, FEED_EVENT_ALERTS_LIMIT)
      })
    ]);

    const alerts = [
      ...reminderTickets
        .map((ticket) =>
          this.formatEventAlert(
            NotificationKind.EVENT_REMINDER,
            this.getEventReminderEntityId(ticket.event),
            ticket.event
          )
        )
        .filter((alert) => !seenReminderIds.includes(alert.id)),
      ...updatedTickets
        .filter((ticket) => ticket.event.updatedAt > ticket.createdAt)
        .map((ticket) =>
          this.formatEventAlert(
            NotificationKind.EVENT_UPDATED,
            this.getEventUpdatedEntityId(ticket.event),
            ticket.event
          )
        )
        .filter((alert) => !seenUpdatedIds.includes(alert.id)),
      ...cancelledTickets
        .map((ticket) =>
          this.formatEventAlert(
            NotificationKind.EVENT_CANCELLED,
            this.getEventCancelledEntityId(ticket.event),
            ticket.event
          )
        )
        .filter((alert) => !seenCancelledIds.includes(alert.id))
    ];

    return Array.from(new Map(alerts.map((alert) => [`${alert.kind}:${alert.id}`, alert])).values())
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, limit);
  }

  private async getSubscriptionAlerts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        subscriptionEndsAt: true
      }
    });
    const subscriptionEndsAt = user?.subscriptionEndsAt;

    if (!subscriptionEndsAt || user.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      return [];
    }

    const now = new Date();
    const alertWindowEndsAt = new Date(now);
    alertWindowEndsAt.setDate(alertWindowEndsAt.getDate() + SUBSCRIPTION_EXPIRING_DAYS);

    if (subscriptionEndsAt <= now || subscriptionEndsAt > alertWindowEndsAt) {
      return [];
    }

    const entityId = this.getSubscriptionExpiringEntityId(subscriptionEndsAt);
    const seenIds = await this.getSeenEntityIds(userId, NotificationKind.SUBSCRIPTION_EXPIRING);

    if (seenIds.includes(entityId)) {
      return [];
    }

    return [
      {
        id: entityId,
        subscriptionEndsAt: subscriptionEndsAt.toISOString()
      }
    ];
  }

  private async getReportUpdates(userId: string) {
    const reports = await this.prisma.userReport.findMany({
      where: {
        reporterId: userId,
        status: { not: ReportStatus.OPEN }
      },
      select: {
        id: true,
        reason: true,
        status: true,
        updatedAt: true
      },
      orderBy: { updatedAt: "desc" },
      take: FEED_REPORT_UPDATES_LIMIT * 3
    });
    const seenIds = await this.getSeenEntityIds(userId, NotificationKind.REPORT_STATUS_UPDATED);

    return reports
      .map((report) => ({
        id: this.getReportStatusEntityId(report.id, report.status),
        reportId: report.id,
        reason: report.reason,
        status: report.status,
        updatedAt: report.updatedAt.toISOString()
      }))
      .filter((report) => !seenIds.includes(report.id))
      .slice(0, FEED_REPORT_UPDATES_LIMIT);
  }

  private async getPaymentAlerts(userId: string) {
    const seenFailedPaymentIds = await this.getSeenEntityIds(userId, NotificationKind.PAYMENT_FAILED);

    const failedPayments = await this.prisma.payment.findMany({
      where: {
        id: { notIn: seenFailedPaymentIds },
        userId,
        status: { in: FAILED_PAYMENT_STATUSES }
      },
      select: {
        id: true,
        purpose: true,
        status: true,
        amountKobo: true,
        updatedAt: true
      },
      orderBy: { updatedAt: "desc" },
      take: FEED_PAYMENT_ALERTS_LIMIT
    });

    return failedPayments
      .map((payment) => this.formatPaymentAlert(NotificationKind.PAYMENT_FAILED, payment))
      .slice(0, FEED_PAYMENT_ALERTS_LIMIT);
  }

  private async getUnreadFeedNotificationCount(userId: string, userCreatedAt: Date) {
    const [
      pendingLikeCount,
      unseenMatchCount,
      unseenRoomCount,
      unseenEventCount,
      unseenTicketCount,
      unseenEventAlertCount,
      unseenSubscriptionCount,
      unseenReportUpdateCount,
      unseenPaymentAlertCount
    ] = await Promise.all([
      this.getPendingLikeCount(userId),
      this.getUnseenMatchNotificationCount(userId),
      this.getUnseenRoomNotificationCount(userId, userCreatedAt),
      this.getUnseenEventNotificationCount(userId, userCreatedAt),
      this.getUnseenTicketNotificationCount(userId),
      this.getUnseenEventAlertCount(userId),
      this.getUnseenSubscriptionNotificationCount(userId),
      this.getUnseenReportUpdateCount(userId),
      this.getUnseenPaymentAlertCount(userId)
    ]);

    return (
      pendingLikeCount +
      unseenMatchCount +
      unseenRoomCount +
      unseenEventCount +
      unseenTicketCount +
      unseenEventAlertCount +
      unseenSubscriptionCount +
      unseenReportUpdateCount +
      unseenPaymentAlertCount
    );
  }

  private async getPendingLikeCount(userId: string) {
    const context = await this.getPendingLikeQueryContext(userId);

    if (!context) {
      return 0;
    }

    return this.prisma.discoveryActionLog.count({
      where: this.getPendingLikeWhere(userId, context)
    });
  }

  private async getPendingLikeQueryContext(userId: string): Promise<PendingLikeQueryContext | null> {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { connectionStatus: true } } }
    });
    const connectionStatus = currentUser?.profile?.connectionStatus;

    if (!connectionStatus) {
      return null;
    }

    const [myActions, existingMatches, blocks] = await Promise.all([
      this.prisma.discoveryActionLog.findMany({
        where: { actorId: userId },
        select: { targetId: true }
      }),
      this.prisma.match.findMany({
        where: {
          status: MatchStatus.ACTIVE,
          OR: [{ userAId: userId }, { userBId: userId }]
        },
        select: { userAId: true, userBId: true }
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [{ blockerId: userId }, { blockedId: userId }]
        },
        select: { blockerId: true, blockedId: true }
      })
    ]);

    const excludedIds = new Set<string>([userId]);

    for (const action of myActions) {
      excludedIds.add(action.targetId);
    }

    for (const match of existingMatches) {
      excludedIds.add(match.userAId === userId ? match.userBId : match.userAId);
    }

    for (const block of blocks) {
      excludedIds.add(block.blockerId === userId ? block.blockedId : block.blockerId);
    }

    return {
      connectionStatus,
      excludedIds,
      now: new Date()
    };
  }

  private getPendingLikeWhere(userId: string, context: PendingLikeQueryContext) {
    return {
      targetId: userId,
      action: DiscoveryAction.LIKE,
      actorId: { notIn: Array.from(context.excludedIds) },
      actor: {
        role: UserRole.USER,
        accountStatus: AccountStatus.ACTIVE,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionEndsAt: { gt: context.now },
        profile: {
          is: {
            bio: { not: null },
            birthDate: { not: null },
            city: { not: null },
            state: { not: null },
            discoveryLive: true,
            interests: { isEmpty: false }
          }
        },
        photos: { some: {} }
      }
    };
  }

  private async getSeenEntityIds(userId: string, kind: NotificationKind) {
    const seenItems = await this.prisma.notificationSeen.findMany({
      where: { userId, kind },
      select: { entityId: true }
    });

    return seenItems.map((item) => item.entityId);
  }

  private async getUnseenMatchNotificationCount(userId: string) {
    const seenMatchIds = await this.getSeenEntityIds(userId, NotificationKind.MATCH_CREATED);

    return this.prisma.match.count({
      where: {
        id: { notIn: seenMatchIds },
        status: MatchStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }]
      }
    });
  }

  private async getUnseenRoomNotificationCount(userId: string, userCreatedAt: Date) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FEED_ROOMS_RECENCY_DAYS);
    const effectiveCutoff = userCreatedAt > cutoff ? userCreatedAt : cutoff;
    const seenRoomIds = await this.getSeenEntityIds(userId, NotificationKind.ROOM_CREATED);

    return this.prisma.chatRoom.count({
      where: {
        id: { notIn: seenRoomIds },
        isActive: true,
        createdAt: { gte: effectiveCutoff },
        memberships: {
          none: { userId }
        }
      }
    });
  }

  private async getUnseenEventNotificationCount(userId: string, userCreatedAt: Date) {
    const now = new Date();
    const seenEventIds = await this.getSeenEntityIds(userId, NotificationKind.EVENT_PUBLISHED);

    return this.prisma.event.count({
      where: {
        id: { notIn: seenEventIds },
        status: EventStatus.PUBLISHED,
        startsAt: { gt: now },
        createdAt: { gte: userCreatedAt },
        tickets: {
          none: {
            userId,
            ...getActiveTicketWhere(now)
          }
        }
      }
    });
  }

  private async getUnseenTicketNotificationCount(userId: string) {
    const seenTicketIds = await this.getSeenEntityIds(userId, NotificationKind.TICKET_CONFIRMED);

    return this.prisma.ticket.count({
      where: {
        id: { notIn: seenTicketIds },
        userId,
        status: { in: CONFIRMED_TICKET_STATUSES }
      }
    });
  }

  private async getUnseenEventAlertCount(userId: string) {
    return (await this.getEventAlerts(userId, FEED_EVENT_ALERTS_LIMIT * 10)).length;
  }

  private async getUnseenSubscriptionNotificationCount(userId: string) {
    return (await this.getSubscriptionAlerts(userId)).length;
  }

  private async getUnseenReportUpdateCount(userId: string) {
    const reports = await this.prisma.userReport.findMany({
      where: {
        reporterId: userId,
        status: { not: ReportStatus.OPEN }
      },
      select: {
        id: true,
        status: true
      }
    });
    const seenIds = await this.getSeenEntityIds(userId, NotificationKind.REPORT_STATUS_UPDATED);

    return reports.filter((report) => !seenIds.includes(this.getReportStatusEntityId(report.id, report.status))).length;
  }

  private async getUnseenPaymentAlertCount(userId: string) {
    const seenFailedPaymentIds = await this.getSeenEntityIds(userId, NotificationKind.PAYMENT_FAILED);

    return this.prisma.payment.count({
      where: {
        id: { notIn: seenFailedPaymentIds },
        userId,
        status: { in: FAILED_PAYMENT_STATUSES }
      }
    });
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
      matches.map((match) => this.countUnreadDirectMessages(match.id, userId, match.readStates[0]?.lastReadAt ?? null))
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
      memberships.map((membership) => this.countUnreadRoomMessages(membership.roomId, userId, membership.lastReadAt))
    );

    return counts.reduce((total, count) => total + count, 0);
  }

  private countUnreadDirectMessages(matchId: string, userId: string, lastReadAt: Date | null) {
    return this.prisma.directMessage.count({
      where: {
        matchId,
        senderId: { not: userId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {})
      }
    });
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

  private candidateInclude(take: number) {
    return {
      include: {
        profile: true,
        photos: {
          orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
          take
        }
      }
    };
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

  private formatDirectMessage(message: DirectMessageSource) {
    return {
      id: message.id,
      matchId: message.matchId,
      senderId: message.senderId,
      senderName: message.sender.displayName,
      body: message.body,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString()
    };
  }

  private formatRoomMessage(message: RoomMessageSource) {
    return {
      id: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorName: message.author.displayName,
      body: message.body,
      createdAt: message.createdAt.toISOString()
    };
  }

  private formatEventAlert(kind: NotificationKind, id: string, event: EventAlertSource) {
    return {
      id,
      kind,
      eventId: event.id,
      title: event.title,
      venue: event.venue,
      state: event.state,
      city: event.city,
      startsAt: event.startsAt.toISOString(),
      cancellationReason: event.cancellationReason ?? null,
      updatedAt: event.updatedAt.toISOString()
    };
  }

  private formatPaymentAlert(
    kind: NotificationKind,
    payment: {
      id: string;
      purpose: PaymentPurpose;
      status: PaymentStatus;
      amountKobo: number;
      updatedAt: Date;
    }
  ) {
    return {
      id: payment.id,
      kind,
      purpose: payment.purpose,
      status: payment.status,
      amountKobo: payment.amountKobo,
      updatedAt: payment.updatedAt.toISOString()
    };
  }

  private getEventReminderEntityId(event: EventAlertSource) {
    return `${event.id}:${event.startsAt.toISOString()}`;
  }

  private getEventUpdatedEntityId(event: EventAlertSource) {
    return `${event.id}:${event.updatedAt.toISOString()}`;
  }

  private getEventCancelledEntityId(event: EventAlertSource) {
    return `${event.id}:cancelled`;
  }

  private getSubscriptionExpiringEntityId(subscriptionEndsAt: Date) {
    return `subscription:${subscriptionEndsAt.toISOString()}`;
  }

  private getReportStatusEntityId(reportId: string, status: ReportStatus) {
    return `${reportId}:${status}`;
  }

}
