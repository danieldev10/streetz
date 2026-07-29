import {
  DEFAULT_DISCOVERY_DISTANCE_KM,
  type ReverseGeocodeSuggestion,
} from "@/lib/location";
import { normalizeLocationSuggestion } from "@/lib/nigeria-locations";
import type { DiscoveryCandidate } from "@/lib/types";

export type DiscoveryLocationMeta = {
  hasCoordinates: boolean;
  city: string | null;
  state: string | null;
  maxDistanceKm: number;
  locationUpdatedAt: string | null;
};

export type DiscoveryResponse = {
  candidates: DiscoveryCandidate[];
  location?: DiscoveryLocationMeta;
};

export const defaultDiscoveryLocation: DiscoveryLocationMeta = {
  hasCoordinates: false,
  city: null,
  state: null,
  maxDistanceKm: DEFAULT_DISCOVERY_DISTANCE_KM,
  locationUpdatedAt: null,
};

const LOCATION_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type DiscoveryFilters = {
  minAge: number | null;
  maxAge: number | null;
};

export function getDefaultDiscoveryFilters(): DiscoveryFilters {
  return {
    minAge: null,
    maxAge: null,
  };
}

export type PendingDisplayLocation = {
  city: string;
  state: string;
};

export function shouldRefreshDiscoveryLocation(location: DiscoveryLocationMeta) {
  if (!location.hasCoordinates || !location.locationUpdatedAt) {
    return true;
  }

  const updatedAt = new Date(location.locationUpdatedAt).getTime();

  if (Number.isNaN(updatedAt)) {
    return true;
  }

  return Date.now() - updatedAt > LOCATION_STALE_AFTER_MS;
}

export function getDisplayLocationSuggestion(
  suggestion: ReverseGeocodeSuggestion,
  currentLocation: Pick<DiscoveryLocationMeta, "city" | "state">
): PendingDisplayLocation | null {
  const normalizedLocation = normalizeLocationSuggestion(suggestion);

  if (!normalizedLocation.city || !normalizedLocation.state) {
    return null;
  }

  const currentCity = currentLocation.city?.trim().toLowerCase() ?? "";
  const currentState = currentLocation.state?.trim().toLowerCase() ?? "";
  const suggestedCity = normalizedLocation.city.trim().toLowerCase();
  const suggestedState = normalizedLocation.state.trim().toLowerCase();

  if (currentCity === suggestedCity && currentState === suggestedState) {
    return null;
  }

  return normalizedLocation;
}
