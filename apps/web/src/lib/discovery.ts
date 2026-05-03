import type { DiscoveryCandidate } from "@/lib/types";
import { getCandidatePhotoUrl, getProfilePhotoFallbackUrl } from "@/lib/media";

export const DISCOVERY_DECK_SIZE = 10;
export const DISCOVERY_RENDERED_STACK_SIZE = 3;
export const DISCOVERY_REFILL_THRESHOLD = 4;
export const DISCOVERY_EXIT_TRANSITION_MS = 180;
export const DISCOVERY_SWIPE_DISTANCE = 92;
export const DISCOVERY_SWIPE_FLICK_DISTANCE = 45;
export const DISCOVERY_SWIPE_FLICK_VELOCITY = 0.55;

export function mergeCandidateDeck(
  currentDeck: DiscoveryCandidate[],
  incomingCandidates: DiscoveryCandidate[],
  dismissedCandidateIds: Set<string>
) {
  const seenCandidateIds = new Set(currentDeck.map((candidate) => candidate.id));
  const nextDeck = [...currentDeck];

  for (const candidate of incomingCandidates) {
    if (seenCandidateIds.has(candidate.id) || dismissedCandidateIds.has(candidate.id)) {
      continue;
    }

    seenCandidateIds.add(candidate.id);
    nextDeck.push(candidate);

    if (nextDeck.length >= DISCOVERY_DECK_SIZE) {
      break;
    }
  }

  return nextDeck.slice(0, DISCOVERY_DECK_SIZE);
}

const preconnectedOrigins = new Set<string>();

export function getUrlOrigin(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function preconnectOrigin(origin: string | null | undefined) {
  if (!origin || typeof document === "undefined") {
    return;
  }

  if (origin === window.location.origin || preconnectedOrigins.has(origin)) {
    return;
  }

  preconnectedOrigins.add(origin);

  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  link.crossOrigin = "";
  document.head.appendChild(link);
}

export function preconnectCandidatePhotoOrigins(candidates: DiscoveryCandidate[]) {
  for (const candidate of candidates) {
    preconnectOrigin(getUrlOrigin(getCandidatePhotoUrl(candidate, "card")));
    preconnectOrigin(getUrlOrigin(getProfilePhotoFallbackUrl(candidate.photos[0], "card")));
  }
}
