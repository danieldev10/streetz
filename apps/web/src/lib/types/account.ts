export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
export type AccountStatus = "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "BANNED" | "DELETED";
export type ModerationActionType =
  | "SUSPEND"
  | "BAN"
  | "RESTORE"
  | "DELETE"
  | "DEACTIVATE"
  | "REACTIVATE";
export type FaceVerificationStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "VERIFIED"
  | "FAILED"
  | "REVIEW_REQUIRED";
export type FaceVerificationMode = "off" | "observe" | "prototype-pass" | "enforce";

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
  faceVerificationStatus: FaceVerificationStatus;
  faceVerificationVerifiedAt?: string | null;
  faceVerificationOverrideReason?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: StreetzUser;
};

export type FaceVerificationAttempt = {
  id: string;
  status: FaceVerificationStatus;
  effectiveStatus: FaceVerificationStatus | null;
  livenessConfidence: number | null;
  faceMatchSimilarity: number | null;
  failureReason: string | null;
  overrideReason: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type FaceVerificationState = {
  mode: FaceVerificationMode;
  enabled: boolean;
  required: boolean;
  status: FaceVerificationStatus;
  verifiedAt: string | null;
  overrideReason: string | null;
  latestAttempt: FaceVerificationAttempt | null;
};
