export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
export type AccountStatus = "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "BANNED" | "DELETED";
export type ModerationActionType =
  | "SUSPEND"
  | "BAN"
  | "RESTORE"
  | "DELETE"
  | "DEACTIVATE"
  | "REACTIVATE";
export type StreetzUser = {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "USER";
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt?: string | null;
  accountStatus: AccountStatus;
  suspendedUntil?: string | null;
  deactivatedAt?: string | null;
  deletedAt?: string | null;
  moderationReason?: string | null;
  ageConfirmedAt?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: StreetzUser;
};
