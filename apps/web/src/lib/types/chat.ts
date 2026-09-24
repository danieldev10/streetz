import type {
  DiscoveryCandidate,
  DiscoveryMatch,
  MatchBlockStatus,
} from "./discovery";

export type DirectMessage = {
  id: string;
  matchId: string;
  conversationId?: string;
  senderId: string;
  senderName: string;
  body: string;
  gifUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export type MatchThread = DiscoveryMatch & {
  status?: "REQUESTED" | "ACTIVE" | "DECLINED" | "CLOSED" | "BLOCKED" | "UNMATCHED";
  requestedById?: string | null;
  requestDirection?: "SENT" | "RECEIVED" | null;
  acceptedAt?: string | null;
  closedAt?: string | null;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  blockStatus: MatchBlockStatus;
};

export type ConversationRequests = {
  received: MatchThread[];
  sent: MatchThread[];
};

export type ChatRoom = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
  eventId: string | null;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    availableUntil: string;
  } | null;
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

export type RoomMessage = {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  author?: DiscoveryCandidate;
  body: string;
  gifUrl: string | null;
  createdAt: string;
};
