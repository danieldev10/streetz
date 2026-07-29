import { DEFAULT_DISCOVERY_DISTANCE_KM } from "@/lib/location";
import type {
  ConnectionStatus,
  Gender,
  Sexuality,
  StreetzProfile,
  StreetzUser,
} from "@/lib/types";

export const SUPPORTED_PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProfileForm = {
  displayName: string;
  bio: string;
  birthDate: string;
  gender: Gender;
  sexuality: Sexuality | "";
  connectionStatus: ConnectionStatus | "";
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyMeters: number | null;
  locationUpdatedAt: string | null;
  maxDistanceKm: number;
  interests: string;
};

export function createProfileForm(
  profile: StreetzProfile | null | undefined,
  user: StreetzUser,
): ProfileForm {
  return {
    displayName: profile?.user.displayName ?? user.displayName,
    bio: profile?.bio ?? "",
    birthDate: profile?.birthDate ? profile.birthDate.slice(0, 10) : "",
    gender: profile?.gender ?? "PREFER_NOT_TO_SAY",
    sexuality: profile?.sexuality ?? "",
    connectionStatus: profile?.connectionStatus ?? "",
    city: profile?.city ?? "",
    state: profile?.state ?? "",
    latitude: profile?.latitude ?? null,
    longitude: profile?.longitude ?? null,
    locationAccuracyMeters: profile?.locationAccuracyMeters ?? null,
    locationUpdatedAt: profile?.locationUpdatedAt ?? null,
    maxDistanceKm: profile?.maxDistanceKm ?? DEFAULT_DISCOVERY_DISTANCE_KM,
    interests: profile?.interests.join(", ") ?? "",
  };
}

export function normalizeInterestValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getInterestKey(value: string) {
  return normalizeInterestValue(value).toLowerCase();
}

export function parseInterestText(value: string) {
  return value
    .split(",")
    .map(normalizeInterestValue)
    .filter(Boolean);
}

export function serializeInterests(interests: string[]) {
  const seen = new Set<string>();
  const uniqueInterests: string[] = [];

  interests.forEach((interest) => {
    const normalized = normalizeInterestValue(interest);
    const key = getInterestKey(normalized);

    if (!normalized || seen.has(key)) {
      return;
    }

    seen.add(key);
    uniqueInterests.push(normalized);
  });

  return uniqueInterests.join(", ");
}
