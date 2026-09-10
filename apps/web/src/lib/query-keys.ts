export const queryKeys = {
  events: (scope: "public" | "member") => ["events", scope] as const,
  profile: (userId: string) => ["profile", userId] as const,
  verification: (userId: string) => ["verification", userId] as const,
  matches: (userId: string) => ["matches", userId] as const,
  directMessages: (userId: string, matchId: string) => ["matches", userId, matchId, "messages"] as const,
  rooms: (userId: string) => ["rooms", userId] as const,
  roomMessages: (userId: string, roomId: string) => ["rooms", userId, roomId, "messages"] as const,
  notifications: (userId: string) => ["notifications", userId] as const
};
