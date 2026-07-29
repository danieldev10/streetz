import type {
  DiscoveryCandidate,
  DiscoveryMatch,
  MatchBlockStatus,
} from "./discovery";

export type DirectMessage = {
  id: string;
  matchId: string;
  senderId: string;
  senderName: string;
  body: string;
  gifUrl: string | null;
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
