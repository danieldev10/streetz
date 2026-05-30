export const DEFAULT_DISCOVERY_DISTANCE_KM = 50;
export const MIN_DISCOVERY_DISTANCE_KM = 5;
export const MAX_DISCOVERY_DISTANCE_KM = 250;
export const DISCOVERY_DISTANCE_STEP_KM = 5;

export type BrowserCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type ReverseGeocodeSuggestion = {
  state: string | null;
  city: string | null;
  stateCandidates: string[];
  cityCandidates: string[];
  formattedAddress: string | null;
};

export function getCurrentBrowserCoordinates(): Promise<BrowserCoordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Location is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
      },
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 12_000,
      },
    );
  });
}

export function getLocationPermissionMessage(error: unknown) {
  if (isGeolocationPositionError(error)) {
    if (error.code === 1) {
      return "Location permission was denied. You can still choose your state and city manually, but exact distances will stay hidden.";
    }

    if (error.code === 2) {
      return "We could not detect your location right now. Choose your state and city manually and try GPS again later.";
    }

    if (error.code === 3) {
      return "Location detection timed out. Check your connection or GPS signal and try again.";
    }
  }

  return error instanceof Error ? error.message : "We could not detect your location right now.";
}

function isGeolocationPositionError(error: unknown): error is { code: number } {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "number";
}

export function formatDistanceKm(distanceKm: number | null | undefined) {
  if (distanceKm === null || distanceKm === undefined) {
    return null;
  }

  if (distanceKm < 1) {
    return "Less than 1 km away";
  }

  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1).replace(/\.0$/, "")} km away`;
  }

  return `${Math.round(distanceKm)} km away`;
}
