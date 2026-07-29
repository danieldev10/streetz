import type { ChatRoom, RoomMessage } from "@/lib/types";

export type RoomViewMode = "explore" | "joined" | "active" | "inactive";
export type AdminRoomView = "list" | "form";
export type AdminRoomMode = "list" | "create" | "edit";

export type RoomForm = {
  name: string;
  category: string;
  description: string;
  isActive: boolean;
};

export const emptyRoomForm: RoomForm = {
  name: "",
  category: "",
  description: "",
  isActive: true,
};

export const ROOM_NAME_MAX_LENGTH = 80;
export const ROOM_CATEGORY_MAX_LENGTH = 80;
export const ROOM_DESCRIPTION_MAX_LENGTH = 280;
export const ROOM_MESSAGE_MAX_LENGTH = 1000;
export const ROOM_MESSAGE_CACHE_LIMIT = 100;
export const MENTION_SUGGESTION_LIMIT = 5;

export function getRoomActivityTime(room: ChatRoom) {
  return Date.parse(room.updatedAt) || Date.parse(room.createdAt) || 0;
}

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

export function getRoomForm(room: ChatRoom): RoomForm {
  return {
    name: room.name,
    category: room.category,
    description: room.description ?? "",
    isActive: room.isActive,
  };
}
