export type StreetzUser = {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "USER";
  subscriptionStatus: "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  subscriptionEndsAt?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: StreetzUser;
};

export type Gender = "WOMAN" | "MAN" | "NON_BINARY" | "PREFER_NOT_TO_SAY";
export type ConnectionStatus = "MEET_NOW" | "FWB" | "JUST_FRIENDS" | "DATING";

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
  age: number | null;
  bio: string | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  interests: string[];
  photos: ProfilePhoto[];
};

export type DiscoveryMatch = {
  id: string;
  createdAt: string;
  user: DiscoveryCandidate;
};

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

export type RoomMessage = {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  body: string;
  deletedAt: string | null;
  createdAt: string;
};

export type TabKey = "discovery" | "matches" | "profile" | "rooms" | "events" | "admin";
export type DiscoveryActionName = "LIKE" | "PASS";
export type ProfileGateState = "checking" | "required" | "ready";
export type ProfileTabMode = "normal" | "setup";

export type NotificationSummary = {
  matchesUnreadCount: number;
  roomsUnreadCount: number;
  totalUnreadCount: number;
};
