import type { DiscoveryCandidate, ProfilePhoto } from "@/lib/types";

export function getProfilePhotoUrl(photo: ProfilePhoto | undefined, variant: "thumb" | "card" | "full" = "card") {
  if (!photo) {
    return null;
  }

  if (variant === "thumb") {
    return photo.thumbUrl ?? photo.cardUrl ?? photo.fullUrl ?? photo.url;
  }

  if (variant === "full") {
    return photo.fullUrl ?? photo.cardUrl ?? photo.url;
  }

  return photo.cardUrl ?? photo.fullUrl ?? photo.url;
}

export function getProfilePhotoFallbackUrl(photo: ProfilePhoto | undefined, variant: "thumb" | "card" | "full" = "card") {
  if (!photo) {
    return null;
  }

  if (variant === "thumb") {
    return (
      photo.thumbFallbackUrl ??
      photo.cardFallbackUrl ??
      photo.fullFallbackUrl ??
      photo.fallbackUrl ??
      photo.thumbUrl ??
      photo.cardUrl ??
      photo.fullUrl ??
      photo.url
    );
  }

  if (variant === "full") {
    return photo.fullFallbackUrl ?? photo.cardFallbackUrl ?? photo.fallbackUrl ?? photo.fullUrl ?? photo.cardUrl ?? photo.url;
  }

  return photo.cardFallbackUrl ?? photo.fullFallbackUrl ?? photo.fallbackUrl ?? photo.cardUrl ?? photo.fullUrl ?? photo.url;
}

export function getCandidatePhotoUrl(candidate: DiscoveryCandidate | undefined, variant: "thumb" | "card" | "full" = "card") {
  return getProfilePhotoUrl(candidate?.photos[0], variant);
}

export function formatImageUrlForDebug(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
}
