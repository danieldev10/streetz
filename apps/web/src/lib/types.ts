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
  ageConfirmedAt?: string | null;
  faceVerificationStatus: FaceVerificationStatus;
  faceVerificationVerifiedAt?: string | null;
  faceVerificationOverrideReason?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: StreetzUser;
};

export type Gender = "WOMAN" | "MAN" | "NON_BINARY" | "PREFER_NOT_TO_SAY";
export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
export type Sexuality = "STRAIGHT" | "GAY" | "LESBIAN" | "BISEXUAL" | "PANSEXUAL" | "ASEXUAL" | "QUEER" | "PREFER_NOT_TO_SAY";
export type ConnectionStatus = "MEET_NOW" | "FWB" | "JUST_FRIENDS" | "DATING";
export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED" | "ACTIONED";
export type AccountStatus = "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "BANNED" | "DELETED";
export type ModerationActionType = "SUSPEND" | "BAN" | "RESTORE" | "DELETE" | "DEACTIVATE" | "REACTIVATE";
export type FaceVerificationStatus = "NOT_STARTED" | "PENDING" | "VERIFIED" | "FAILED" | "REVIEW_REQUIRED";
export type FaceVerificationMode = "off" | "observe" | "prototype-pass" | "enforce";

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
  sexuality: Sexuality | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyMeters: number | null;
  locationUpdatedAt: string | null;
  maxDistanceKm: number;
  interests: string[];
  discoveryLive: boolean;
  attendedEventCount: number;
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
  gender?: Gender | null;
  sexuality?: Sexuality | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  distanceKm?: number | null;
  attendedEventCount: number;
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
  matchedConnectionStatus: ConnectionStatus | null;
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

export type RoomMember = DiscoveryCandidate & {
  joinedAt: string;
};

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
export type TicketStatus = "RESERVED" | "PAID" | "CHECKED_IN" | "CANCELLED" | "REFUNDED";
export type PaymentPurpose =
  | "SUBSCRIPTION"
  | "EVENT_TICKET"
  | "MEMBERSHIP_EVENT_TICKET"
  | "RAFFLE_TICKET"
  | "MEMBERSHIP_RAFFLE_TICKET";

export type RaffleStatus = "SCHEDULED" | "SELLING" | "SALES_CLOSED" | "DRAWN" | "CANCELLED";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "ABANDONED" | "REVERSED";

export type StreetzEventTicketType = {
  id: string;
  name: string;
  priceKobo: number;
  capacity: number;
  maxTicketsPerUser: number;
  soldCount: number;
  reservedCount: number;
  availableCount: number;
};

export type StreetzEventTicket = {
  id: string;
  code: string;
  status: TicketStatus;
  checkedInAt: string | null;
  ticketType: {
    id: string;
    name: string;
    priceKobo: number;
  } | null;
  createdAt: string;
};

export type StreetzEvent = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  category: string;
  venue: string;
  state: string | null;
  city: string;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
  cancellationReason: string | null;
  cancelledAt: string | null;
  ticketType: StreetzEventTicketType | null;
  ticketTypes: StreetzEventTicketType[];
  attendeeCount?: number;
  reservationCount?: number;
  totalPaidAmountKobo?: number;
  userTicket?: StreetzEventTicket | null;
  userTickets?: StreetzEventTicket[];
  createdAt: string;
  updatedAt: string;
};

export type RafflePrize = {
  title: string;
  description: string | null;
  image: string | null;
  category: string | null;
  estimatedValueKobo: number | null;
};

export type RaffleWinner = {
  entryId: string;
  number: number;
  userId: string;
  displayName: string;
  drawnAt: string | null;
};

export type RaffleDetails = {
  status: RaffleStatus;
  ticketPriceKobo: number;
  salesStartsAt: string;
  salesEndsAt: string;
  drawsAt: string;
  prize: RafflePrize;
  ticketsSold: number;
  yourEntryCount: number;
  winner: RaffleWinner | null;
  participantsCount?: number;
  totalRevenueKobo?: number;
};

export type StreetzRaffle = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  status: EventStatus;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  raffle: RaffleDetails;
};

export type RaffleEntry = {
  id: string;
  number: number;
  createdAt: string;
};

export type MyRaffleEntries = {
  raffleId: string;
  title: string;
  prizeTitle: string;
  drawsAt: string;
  status: RaffleStatus;
  count: number;
  isWinner: boolean;
  winningNumber: number | null;
  entries: RaffleEntry[];
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
  author?: DiscoveryCandidate;
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
  | "reports"
  | "users";
export type DiscoveryActionName = "LIKE" | "PASS";
export type ProfileGateState = "checking" | "required" | "ready";
export type ProfileTabMode = "normal" | "setup";

export type FaceVerificationAttempt = {
  id: string;
  status: FaceVerificationStatus;
  effectiveStatus: FaceVerificationStatus | null;
  livenessConfidence: number | null;
  faceMatchSimilarity: number | null;
  failureReason: string | null;
  overrideReason: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type FaceVerificationState = {
  mode: FaceVerificationMode;
  enabled: boolean;
  required: boolean;
  status: FaceVerificationStatus;
  verifiedAt: string | null;
  overrideReason: string | null;
  latestAttempt: FaceVerificationAttempt | null;
};

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

// ── Admin User Management ──────────────────────────────────────────────────

export type AdminUserSummary = {
  id: string;
  displayName: string;
  email: string;
  role: "ADMIN" | "USER";
  accountStatus: AccountStatus;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  moderationReason: string | null;
  createdAt: string;
  profile: {
    city: string | null;
    state: string | null;
    connectionStatus: ConnectionStatus | null;
    discoveryLive: boolean;
  } | null;
  matchCount: number;
  ticketCount: number;
  roomCount: number;
};

export type AdminUserActivity = {
  id: string;
  displayName: string;
  email: string;
  role: "ADMIN" | "USER";
  accountStatus: AccountStatus;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  suspendedUntil: string | null;
  deactivatedAt: string | null;
  deletedAt: string | null;
  moderationReason: string | null;
  ageConfirmedAt: string | null;
  createdAt: string;
  profile: {
    bio: string | null;
    birthDate: string | null;
    gender: string | null;
    sexuality: string | null;
    connectionStatus: string | null;
    city: string | null;
    state: string | null;
    interests: string[];
    discoveryLive: boolean;
    maxDistanceKm: number;
    locationUpdatedAt: string | null;
  } | null;
  photoCount: number;
  payments: Array<{
    id: string;
    purpose: string;
    status: string;
    amountKobo: number;
    provider: string;
    createdAt: string;
    updatedAt: string;
  }>;
  discoveryActions: Array<{
    targetId: string;
    targetName: string;
    action: string;
    createdAt: string;
  }>;
  receivedActions: Array<{
    actorId: string;
    actorName: string;
    action: string;
    createdAt: string;
  }>;
  matches: Array<{
    id: string;
    otherUserId: string;
    otherUserName: string;
    status: string;
    createdAt: string;
  }>;
  roomMemberships: Array<{
    roomId: string;
    roomName: string;
    roomCategory: string;
    joinedAt: string;
  }>;
  tickets: Array<{
    id: string;
    code: string;
    eventId: string;
    eventTitle: string;
    ticketTypeName: string;
    priceKobo: number;
    status: string;
    checkedInAt: string | null;
    createdAt: string;
  }>;
  moderationActions: Array<{
    action: string;
    reason: string | null;
    expiresAt: string | null;
    adminName: string | null;
    createdAt: string;
  }>;
  loginSessions: Array<{
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
};
