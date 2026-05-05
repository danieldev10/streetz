export function getUserNotificationRoom(userId: string) {
  return `user:${userId}:notifications`;
}
