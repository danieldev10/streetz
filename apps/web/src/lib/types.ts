export type StreetzUser = {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "USER";
  subscriptionStatus: "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  subscriptionEndsAt?: string | null;
  accountStatus: AccountStatus;
  suspendedUntil?: string | null;
  deactivatedAt?: string | null;
  deletedAt?: string | null;
  moderationReason?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: StreetzUser;
};

export type Gender = "WOMAN" | "MAN" | "NON_BINARY" | "PREFER_NOT_TO_SAY";
export type ConnectionStatus = "MEET_NOW" | "FWB" | "JUST_FRIENDS" | "DATING";
export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED" | "ACTIONED";
export type AccountStatus = "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "BANNED" | "DELETED";
export type ModerationActionType = "SUSPEND" | "BAN" | "RESTORE" | "DELETE" | "DEACTIVATE" | "REACTIVATE";

export type ProfilePhoto = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  thumbFallbackUrl?: string | null;
  cardUrl?: string | null;
  cardFallbackUrl?: string | null;
  fullUrl?: string | null;
  fullFallbackUrl?: string | null;
  fallbackUrl?: string | null;
  blurDataUrl?: string | null;
  sortOrder: number;
};

export type StreetzProfile = {
  id: string;
  bio: string | null;
  birthDate: string | null;
  gender: Gender | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  interests: string[];
  discoveryLive: boolean;
  user: {
    id: string;
    displayName: string;
    email: string;
    photos: ProfilePhoto[];
  };
};

export type DiscoveryCandidate = {
  id: string;
  displayName: string;
  accountStatus?: AccountStatus;
  age: number | null;
  bio: string | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  interests: string[];
  photos: ProfilePhoto[];
};

export type BlockedAccount = DiscoveryCandidate & {
  blockedAt: string;
  blockReason: string | null;
};

export type DiscoveryMatch = {
  id: string;
  createdAt: string;
  user: DiscoveryCandidate;
};

export type MatchBlockStatus = "NONE" | "BLOCKED_BY_ME" | "BLOCKED_ME" | "MUTUAL";

export type DirectMessage = {
  id: string;
  matchId: string;
  senderId: string;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type MatchThread = DiscoveryMatch & {
  lastMessage: DirectMessage | null;
  unreadCount: number;
  blockStatus: MatchBlockStatus;
};

export type ChatRoom = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
  hasJoined: boolean;
  memberCount: number;
  messageCount?: number;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
export type TicketStatus = "RESERVED" | "PAID" | "CHECKED_IN" | "CANCELLED" | "REFUNDED";
export type PaymentPurpose = "SUBSCRIPTION" | "EVENT_TICKET";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "ABANDONED" | "REVERSED";

export type StreetzEventTicketType = {
  id: string;
  name: string;
  priceKobo: number;
  capacity: number;
  soldCount: number;
  reservedCount: number;
  availableCount: number;
};

export type StreetzEventTicket = {
  id: string;
  code: string;
  status: TicketStatus;
  createdAt: string;
};

export type StreetzEvent = {
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
  status: EventStatus;
  ticketType: StreetzEventTicketType | null;
  attendeeCount?: number;
  reservationCount?: number;
  userTicket?: StreetzEventTicket | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminMetrics = {
  members: {
    total: number;
    activeSubscribers: number;
    completedProfiles: number;
  };
  discovery: {
    activeMatches: number;
  };
  rooms: {
    total: number;
    members: number;
    messages: number;
  };
  events: {
    published: number;
    ticketsBooked: number;
    ticketRevenueKobo: number;
  };
  reports: {
    total: number;
    open: number;
  };
};

export type AdminReportUser = {
  id: string;
  displayName: string;
  email: string;
  subscriptionStatus: StreetzUser["subscriptionStatus"];
  accountStatus: AccountStatus;
  suspendedUntil: string | null;
  deactivatedAt: string | null;
  deletedAt: string | null;
  moderationReason: string | null;
  age: number | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  connectionStatus: ConnectionStatus | null;
  interests: string[];
  photos: ProfilePhoto[];
};

export type AdminReport = {
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  reporter: AdminReportUser;
  reported: AdminReportUser;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type TabKey =
  | "discovery"
  | "matches"
  | "profile"
  | "blockedAccounts"
  | "notifications"
  | "rooms"
  | "events"
  | "admin"
  | "reports";
export type DiscoveryActionName = "LIKE" | "PASS";
export type ProfileGateState = "checking" | "required" | "ready";
export type ProfileTabMode = "normal" | "setup";

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
  | "SUBSCRIPTION_PAYMENT_SUCCESS";

export type NotificationFeedMatch = {
  id: string;
  createdAt: string;
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

export type NotificationFeedEventAlert = {
  id: string;
  kind: Extract<NotificationKind, "EVENT_REMINDER" | "EVENT_UPDATED" | "EVENT_CANCELLED">;
  eventId: string;
  title: string;
  venue: string;
  state: string | null;
  city: string;
  startsAt: string;
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
  eventAlerts: NotificationFeedEventAlert[];
  subscriptionAlerts: NotificationFeedSubscriptionAlert[];
  reportUpdates: NotificationFeedReportUpdate[];
  paymentAlerts: NotificationFeedPaymentAlert[];
};
