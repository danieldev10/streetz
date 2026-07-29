export type Gender = "WOMAN" | "MAN" | "NON_BINARY" | "PREFER_NOT_TO_SAY";
export type DiscoveryGender = Exclude<Gender, "PREFER_NOT_TO_SAY">;
export type Sexuality =
  | "STRAIGHT"
  | "GAY"
  | "LESBIAN"
  | "BISEXUAL"
  | "PANSEXUAL"
  | "ASEXUAL"
  | "QUEER"
  | "PREFER_NOT_TO_SAY";
export type ConnectionStatus = "MEET_NOW" | "FWB" | "JUST_FRIENDS" | "DATING";

export type ProfilePhoto = {
  id: string;
  url: string;
  thumbUrl?: string | null;
  thumbFallbackUrl?: string | null;
  cardUrl?: string | null;
  cardFallbackUrl?: string | null;
  fullUrl?: string | null;
  fullFallbackUrl?: string | null;
  fallbackUrl?: string | null;
  blurDataUrl?: string | null;
  sortOrder: number;
};

export type StreetzProfile = {
  id: string;
  bio: string | null;
  birthDate: string | null;
  gender: Gender | null;
  sexuality: Sexuality | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyMeters: number | null;
  locationUpdatedAt: string | null;
  maxDistanceKm: number;
  interests: string[];
  discoveryLive: boolean;
  attendedEventCount: number;
  user: {
    id: string;
    displayName: string;
    email: string;
    photos: ProfilePhoto[];
  };
};

export type ProfileGateState = "checking" | "required" | "ready";
export type ProfileTabMode = "normal" | "setup";
