import type { AccountStatus } from "./account";
import type {
  ConnectionStatus,
  DiscoveryGender,
  Gender,
  ProfilePhoto,
  Sexuality,
} from "./profile";

export type DiscoveryPreference = {
  discoveryGender: DiscoveryGender | null;
  showGender: boolean;
  interestedInGenders: DiscoveryGender[];
  minAge: number;
  maxAge: number;
  confirmedAt: string | null;
  needsConfirmation: boolean;
};

export type DiscoveryCandidate = {
  id: string;
  displayName: string;
  accountStatus?: AccountStatus;
  age: number | null;
  bio: string | null;
  gender?: Gender | null;
  sexuality?: Sexuality | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  distanceKm?: number | null;
  attendedEventCount: number;
  interests: string[];
  photos: ProfilePhoto[];
};

export type BlockedAccount = DiscoveryCandidate & {
  blockedAt: string;
  blockReason: string | null;
};

export type DiscoveryMatch = {
  id: string;
  createdAt: string;
  matchedConnectionStatus: ConnectionStatus | null;
  user: DiscoveryCandidate;
};

export type MatchBlockStatus = "NONE" | "BLOCKED_BY_ME" | "BLOCKED_ME" | "MUTUAL";
export type DiscoveryActionName = "LIKE" | "PASS";
