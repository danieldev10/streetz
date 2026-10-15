import { FaceVerificationStatus } from "@prisma/client";

export type VerificationBadgeSource = {
  faceVerificationStatus?: FaceVerificationStatus;
  faceVerificationOverrideReason?: string | null;
};

// Prototype overrides allow test journeys but never earn a public trust badge.
export function hasVerifiedProfile(user: VerificationBadgeSource) {
  return user.faceVerificationStatus === FaceVerificationStatus.VERIFIED &&
    user.faceVerificationOverrideReason == null;
}
