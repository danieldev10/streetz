import type { RoomMessage } from "@/lib/types";

export const ROOM_MESSAGE_MAX_LENGTH = 1000;
export const ROOM_MESSAGE_CACHE_LIMIT = 100;
export const MENTION_SUGGESTION_LIMIT = 5;

export function getRoomMessageTime(message: RoomMessage) {
  return Date.parse(message.createdAt) || 0;
}

export function mergeCachedRoomMessages(current: RoomMessage[] | undefined, incoming: RoomMessage[]) {
  const byId = new Map((current ?? []).map((message) => [message.id, message]));

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()]
    .sort((first, second) => getRoomMessageTime(first) - getRoomMessageTime(second))
    .slice(-ROOM_MESSAGE_CACHE_LIMIT);
}
