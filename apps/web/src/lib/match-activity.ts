import type { MatchThread } from "@/lib/types";

const MATCH_ACTIVITY_SEEN_KEY_PREFIX = "streetz_seen_match_ids";
const MATCH_ACTIVITY_READ_KEY_PREFIX = "streetz_read_match_message_at";
const MATCH_ACTIVITY_INITIALIZED_KEY_PREFIX = "streetz_match_activity_initialized";

export function getUserStorageKey(prefix: string, userId: string) {
  return `${prefix}_${userId}`;
}

export function readStorageJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);

  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeStorageJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getSeenMatchIds(userId: string) {
  return new Set(readStorageJson<string[]>(getUserStorageKey(MATCH_ACTIVITY_SEEN_KEY_PREFIX, userId), []));
}

export function saveSeenMatchIds(userId: string, matchIds: Set<string>) {
  writeStorageJson(getUserStorageKey(MATCH_ACTIVITY_SEEN_KEY_PREFIX, userId), Array.from(matchIds));
}

export function getReadMatchMessageAt(userId: string) {
  return readStorageJson<Record<string, string>>(getUserStorageKey(MATCH_ACTIVITY_READ_KEY_PREFIX, userId), {});
}

export function saveReadMatchMessageAt(userId: string, readMessageAt: Record<string, string>) {
  writeStorageJson(getUserStorageKey(MATCH_ACTIVITY_READ_KEY_PREFIX, userId), readMessageAt);
}

export function isMatchActivityInitialized(userId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(getUserStorageKey(MATCH_ACTIVITY_INITIALIZED_KEY_PREFIX, userId)) === "true";
}

export function setMatchActivityInitialized(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getUserStorageKey(MATCH_ACTIVITY_INITIALIZED_KEY_PREFIX, userId), "true");
}

export function seedMatchActivity(userId: string, matches: MatchThread[]) {
  const seenMatchIds = getSeenMatchIds(userId);
  const readMessageAt = getReadMatchMessageAt(userId);

  for (const match of matches) {
    seenMatchIds.add(match.id);

    if (match.lastMessage) {
      readMessageAt[match.id] = match.lastMessage.createdAt;
    }
  }

  saveSeenMatchIds(userId, seenMatchIds);
  saveReadMatchMessageAt(userId, readMessageAt);
  setMatchActivityInitialized(userId);
}

export function getMatchActivityWeight(userId: string, match: MatchThread) {
  if (!isMatchActivityInitialized(userId)) {
    return 0;
  }

  const seenMatchIds = getSeenMatchIds(userId);
  const readMessageAt = getReadMatchMessageAt(userId);
  const unreadNewMatchCount = seenMatchIds.has(match.id) ? 0 : 1;
  const lastMessage = match.lastMessage;
  const unreadMessageCount =
    lastMessage &&
    lastMessage.senderId !== userId &&
    (!readMessageAt[match.id] || new Date(lastMessage.createdAt) > new Date(readMessageAt[match.id]))
      ? 1
      : 0;

  return unreadNewMatchCount + unreadMessageCount;
}

export function getUnreadMatchActivityCount(userId: string, matches: MatchThread[], seedIfNeeded: boolean) {
  if (!isMatchActivityInitialized(userId)) {
    if (seedIfNeeded) {
      seedMatchActivity(userId, matches);
      return 0;
    }

    setMatchActivityInitialized(userId);
  }

  return matches.reduce((total, match) => total + getMatchActivityWeight(userId, match), 0);
}

export function markMatchThreadOpened(userId: string, match: MatchThread) {
  const seenMatchIds = getSeenMatchIds(userId);
  const readMessageAt = getReadMatchMessageAt(userId);

  seenMatchIds.add(match.id);

  if (match.lastMessage) {
    readMessageAt[match.id] = match.lastMessage.createdAt;
  }

  saveSeenMatchIds(userId, seenMatchIds);
  saveReadMatchMessageAt(userId, readMessageAt);
  setMatchActivityInitialized(userId);
}
