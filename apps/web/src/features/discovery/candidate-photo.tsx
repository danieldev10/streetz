import { ProfilePhotoImage } from "@/components/profile-photo-image";
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
