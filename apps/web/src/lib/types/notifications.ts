import type { ReportStatus } from "./admin";
import type { DirectMessage, RoomMessage } from "./chat";
import type { DiscoveryCandidate } from "./discovery";
import type { TicketStatus } from "./events";
import type { PaymentPurpose, PaymentStatus } from "./payments";

export type NotificationSummary = {
  matchesUnreadCount: number;
  roomsUnreadCount: number;
  notificationsUnreadCount: number;
  totalUnreadCount: number;
};

export type NotificationFeedLike = DiscoveryCandidate & {
  likedAt: string | null;
};

export type NotificationKind =
  | "ROOM_CREATED"
  | "EVENT_PUBLISHED"
  | "MATCH_CREATED"
  | "TICKET_CONFIRMED"
  | "SUBSCRIPTION_EXPIRING"
  | "REPORT_STATUS_UPDATED"
  | "EVENT_REMINDER"
  | "EVENT_UPDATED"
  | "EVENT_CANCELLED"
  | "PAYMENT_FAILED"
  | "SUBSCRIPTION_PAYMENT_SUCCESS"
  | "RAFFLE_TICKETS_CONFIRMED"
  | "RAFFLE_WON";

export type NotificationFeedMatch = {
  id: string;
  createdAt: string;
  seen: boolean;
  user: DiscoveryCandidate;
};

export type NotificationFeedDirectMessage = {
  id: string;
  matchId: string;
  user: DiscoveryCandidate;
  lastMessage: DirectMessage;
  unreadCount: number;
  updatedAt: string;
};

export type NotificationFeedRoomMessage = {
  id: string;
  roomId: string;
  name: string;
  category: string;
  lastMessage: RoomMessage;
  unreadCount: number;
  updatedAt: string;
};

export type NotificationFeedRoom = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  memberCount: number;
  createdAt: string;
};

export type NotificationFeedEvent = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  venue: string;
  state: string | null;
  city: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
};

export type NotificationFeedTicket = {
  id: string;
  code: string;
  status: TicketStatus;
  createdAt: string;
  event: {
    id: string;
    title: string;
    venue: string;
    state: string | null;
    city: string;
    startsAt: string;
  };
  ticketType: {
    id: string;
    name: string;
    priceKobo: number;
  };
};

export type NotificationFeedRaffleWin = {
  id: string;
  raffleId: string;
  title: string;
  prizeTitle: string;
  prizeImage: string | null;
  winningNumber: number | null;
  drawnAt: string;
};

export type NotificationFeedEventAlert = {
  id: string;
  kind: Extract<NotificationKind, "EVENT_REMINDER" | "EVENT_UPDATED" | "EVENT_CANCELLED">;
  eventId: string;
  title: string;
  venue: string;
  state: string | null;
  city: string;
  startsAt: string;
  cancellationReason: string | null;
  updatedAt: string;
};

export type NotificationFeedSubscriptionAlert = {
  id: string;
  subscriptionEndsAt: string;
};

export type NotificationFeedReportUpdate = {
  id: string;
  reportId: string;
  reason: string;
  status: ReportStatus;
  updatedAt: string;
};

export type NotificationFeedPaymentAlert = {
  id: string;
  kind: Extract<NotificationKind, "PAYMENT_FAILED" | "SUBSCRIPTION_PAYMENT_SUCCESS">;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  amountKobo: number;
  updatedAt: string;
};

export type NotificationFeed = {
  likes: NotificationFeedLike[];
  matches: NotificationFeedMatch[];
  directMessages: NotificationFeedDirectMessage[];
  roomMessages: NotificationFeedRoomMessage[];
  rooms: NotificationFeedRoom[];
  events: NotificationFeedEvent[];
  tickets: NotificationFeedTicket[];
  raffleWins: NotificationFeedRaffleWin[];
  eventAlerts: NotificationFeedEventAlert[];
  subscriptionAlerts: NotificationFeedSubscriptionAlert[];
  reportUpdates: NotificationFeedReportUpdate[];
  paymentAlerts: NotificationFeedPaymentAlert[];
};
