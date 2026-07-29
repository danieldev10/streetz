import type { AccountStatus, StreetzUser, SubscriptionStatus } from "./account";
import type { ConnectionStatus, ProfilePhoto } from "./profile";

export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED" | "ACTIONED";

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
  system?: {
    databasePool: {
      maxConnections: number;
      totalConnections: number;
      activeConnections: number;
      idleConnections: number;
      waitingRequests: number;
      utilizationPercent: number;
      connectionTimeoutMs: number;
      statementTimeoutMs: number;
    };
    process: {
      uptimeSeconds: number;
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
    };
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
