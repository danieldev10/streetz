import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { DeletedAccountAvatar } from "@/components/deleted-account-avatar";
import type { DiscoveryCandidate } from "@/lib/types";

export function CandidatePhoto({
  candidate,
  priority = false,
  variant = "card",
}: {
  candidate: DiscoveryCandidate;
  priority?: boolean;
  variant?: "thumb" | "card" | "full";
}) {
  if (candidate.accountStatus === "DELETED") {
    return <DeletedAccountAvatar />;
  }

  const photo = candidate.photos[0];

  return (
    <ProfilePhotoImage
      photo={photo}
      alt={`${candidate.displayName} profile`}
      variant={variant}
      priority={priority}
      sizes={variant === "thumb" ? "96px" : "(max-width: 768px) 100vw, 430px"}
      iconSize="md"
    />
  );
}
