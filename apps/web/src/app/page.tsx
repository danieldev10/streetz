"use client";

import Image from "next/image";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarDays,
  Camera,
  Eye,
  Flag,
  Heart,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Power,
  RefreshCw,
  Search,
  SendHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { ChangeEvent, CSSProperties, FormEvent, PointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL.replace(/\/api\/?$/, "");
const TOKEN_KEY = "streetz_access_token";
const DISCOVERY_DECK_SIZE = 10;
const DISCOVERY_RENDERED_STACK_SIZE = 3;
const DISCOVERY_REFILL_THRESHOLD = 4;
const DISCOVERY_EXIT_TRANSITION_MS = 180;
const DISCOVERY_SWIPE_DISTANCE = 92;
const DISCOVERY_SWIPE_FLICK_DISTANCE = 45;
const DISCOVERY_SWIPE_FLICK_VELOCITY = 0.55;
const PROFILE_PHOTO_LIMIT = 4;
const MATCH_ACTIVITY_SEEN_KEY_PREFIX = "streetz_seen_match_ids";
const MATCH_ACTIVITY_READ_KEY_PREFIX = "streetz_read_match_message_at";
const MATCH_ACTIVITY_INITIALIZED_KEY_PREFIX = "streetz_match_activity_initialized";

type StreetzUser = {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "USER";
  subscriptionStatus: "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  subscriptionEndsAt?: string | null;
};

type AuthResponse = {
  accessToken: string;
  user: StreetzUser;
};

type Gender = "WOMAN" | "MAN" | "NON_BINARY" | "PREFER_NOT_TO_SAY";
type ConnectionStatus = "MEET_NOW" | "FWB" | "JUST_FRIENDS" | "DATING";

type ProfilePhoto = {
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

type StreetzProfile = {
  id: string;
  bio: string | null;
  birthDate: string | null;
  gender: Gender | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  interests: string[];
  discoveryLive: boolean;
  user: {
    id: string;
    displayName: string;
    email: string;
    photos: ProfilePhoto[];
  };
};

type DiscoveryCandidate = {
  id: string;
  displayName: string;
  age: number | null;
  bio: string | null;
  connectionStatus: ConnectionStatus | null;
  city: string | null;
  state: string | null;
  interests: string[];
  photos: ProfilePhoto[];
};

type DiscoveryMatch = {
  id: string;
  createdAt: string;
  user: DiscoveryCandidate;
};

type DirectMessage = {
  id: string;
  matchId: string;
  senderId: string;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type MatchThread = DiscoveryMatch & {
  lastMessage: DirectMessage | null;
};

type TabKey = "discovery" | "matches" | "profile" | "rooms" | "events";
type DiscoveryActionName = "LIKE" | "PASS";
type ProfileGateState = "checking" | "required" | "ready";
type ProfileTabMode = "normal" | "setup";

const tabs: Array<{ id: TabKey; label: string; icon: LucideIcon }> = [
  { id: "discovery", label: "Discover", icon: Heart },
  { id: "matches", label: "Matches", icon: MessagesSquare },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "rooms", label: "Rooms", icon: MessageCircle },
  { id: "events", label: "Events", icon: Ticket },
];

const connectionStatusOptions: Array<{ value: ConnectionStatus; label: string }> = [
  { value: "MEET_NOW", label: "Meet Now" },
  { value: "FWB", label: "FWB" },
  { value: "JUST_FRIENDS", label: "Just Friends" },
  { value: "DATING", label: "Dating" },
];

const connectionStatusLabels: Record<ConnectionStatus, string> = {
  MEET_NOW: "Meet Now",
  FWB: "FWB",
  JUST_FRIENDS: "Just Friends",
  DATING: "Dating",
};

const rooms = [
  {
    name: "Lagos After Work",
    city: "Lagos",
    members: "18.4k",
    live: "Live",
    lastMessage: "Tonight's Lekki lineup just dropped.",
  },
  {
    name: "Abuja Link Up",
    city: "Abuja",
    members: "9.7k",
    live: "Open",
    lastMessage: "Who is heading to Wuse after 7?",
  },
  {
    name: "Streetz Events",
    city: "Nigeria",
    members: "31.2k",
    live: "Admin",
    lastMessage: "Verified event drops and ticket updates.",
  },
];

const events = [
  {
    title: "Island Social Night",
    city: "Victoria Island",
    date: "May 18",
    time: "8:00 PM",
    price: "₦7,500",
    image:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Abuja Rooftop Mixer",
    city: "Wuse 2",
    date: "Jun 02",
    time: "7:30 PM",
    price: "₦5,000",
    image:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Mainland Art Crawl",
    city: "Yaba",
    date: "Jun 14",
    time: "4:00 PM",
    price: "₦3,000",
    image:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=900&q=80",
  },
];

function isActiveMember(user: StreetzUser | null) {
  if (!user) {
    return false;
  }

  if (user.role === "ADMIN") {
    return true;
  }

  return (
    user.subscriptionStatus === "ACTIVE" &&
    Boolean(user.subscriptionEndsAt) &&
    new Date(user.subscriptionEndsAt as string) > new Date()
  );
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message ?? "Request failed.");
  }

  return data as T;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function getAgeFromBirthDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const birthDate = new Date(value);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayHasPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!birthdayHasPassed) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function getProfilePhotoUrl(photo: ProfilePhoto | undefined, variant: "thumb" | "card" | "full" = "card") {
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

function getProfilePhotoFallbackUrl(photo: ProfilePhoto | undefined, variant: "thumb" | "card" | "full" = "card") {
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

function getCandidatePhotoUrl(candidate: DiscoveryCandidate | undefined, variant: "thumb" | "card" | "full" = "card") {
  return getProfilePhotoUrl(candidate?.photos[0], variant);
}

function formatConnectionStatus(status: ConnectionStatus | null | undefined) {
  return status ? connectionStatusLabels[status] : "Streetz member";
}

function getProfileSetupIssuesFromForm(
  form: {
    bio: string;
    birthDate: string;
    connectionStatus: ConnectionStatus | "";
    city: string;
    state: string;
    interests: string;
  },
  photoCount: number
) {
  const interests = form.interests
    .split(",")
    .map((interest) => interest.trim())
    .filter(Boolean);
  const issues: string[] = [];

  if (photoCount < 1) {
    issues.push("add at least one profile photo");
  }

  if (!form.bio.trim()) {
    issues.push("write a bio");
  }

  if (!form.birthDate) {
    issues.push("add your birth date");
  }

  if (!form.connectionStatus) {
    issues.push("choose your status");
  }

  if (!form.city.trim()) {
    issues.push("add your city");
  }

  if (!form.state.trim()) {
    issues.push("add your state");
  }

  if (interests.length < 1) {
    issues.push("add at least one interest");
  }

  return issues;
}

function getProfileSetupIssues(profile: StreetzProfile | null | undefined) {
  if (!profile) {
    return ["set up your profile"];
  }

  return getProfileSetupIssuesFromForm(
    {
      bio: profile.bio ?? "",
      birthDate: profile.birthDate ? profile.birthDate.slice(0, 10) : "",
      connectionStatus: profile.connectionStatus ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      interests: profile.interests.join(", "),
    },
    profile.user.photos.length
  );
}

function isProfileReadyForDiscovery(profile: StreetzProfile | null | undefined) {
  return getProfileSetupIssues(profile).length === 0;
}

function formatProfileSetupIssues(issues: string[]) {
  if (issues.length === 0) {
    return "";
  }

  if (issues.length === 1) {
    return issues[0];
  }

  if (issues.length === 2) {
    return `${issues[0]} and ${issues[1]}`;
  }

  return `${issues.slice(0, -1).join(", ")}, and ${issues.at(-1)}`;
}

function mergeCandidateDeck(
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

function getUserStorageKey(prefix: string, userId: string) {
  return `${prefix}_${userId}`;
}

function readStorageJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);

  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeStorageJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function getSeenMatchIds(userId: string) {
  return new Set(readStorageJson<string[]>(getUserStorageKey(MATCH_ACTIVITY_SEEN_KEY_PREFIX, userId), []));
}

function saveSeenMatchIds(userId: string, matchIds: Set<string>) {
  writeStorageJson(getUserStorageKey(MATCH_ACTIVITY_SEEN_KEY_PREFIX, userId), Array.from(matchIds));
}

function getReadMatchMessageAt(userId: string) {
  return readStorageJson<Record<string, string>>(getUserStorageKey(MATCH_ACTIVITY_READ_KEY_PREFIX, userId), {});
}

function saveReadMatchMessageAt(userId: string, readMessageAt: Record<string, string>) {
  writeStorageJson(getUserStorageKey(MATCH_ACTIVITY_READ_KEY_PREFIX, userId), readMessageAt);
}

function isMatchActivityInitialized(userId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(getUserStorageKey(MATCH_ACTIVITY_INITIALIZED_KEY_PREFIX, userId)) === "true";
}

function setMatchActivityInitialized(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getUserStorageKey(MATCH_ACTIVITY_INITIALIZED_KEY_PREFIX, userId), "true");
}

function seedMatchActivity(userId: string, matches: MatchThread[]) {
  const seenMatchIds = getSeenMatchIds(userId);
  const readMessageAt = getReadMatchMessageAt(userId);

  for (const match of matches) {
    seenMatchIds.add(match.id);

    if (match.lastMessage) {
      readMessageAt[match.id] = match.lastMessage.createdAt;
    }
  }

  saveSeenMatchIds(userId, seenMatchIds);
  saveReadMatchMessageAt(userId, readMessageAt);
  setMatchActivityInitialized(userId);
}

function getMatchActivityWeight(userId: string, match: MatchThread) {
  if (!isMatchActivityInitialized(userId)) {
    return 0;
  }

  const seenMatchIds = getSeenMatchIds(userId);
  const readMessageAt = getReadMatchMessageAt(userId);
  const unreadNewMatchCount = seenMatchIds.has(match.id) ? 0 : 1;
  const lastMessage = match.lastMessage;
  const unreadMessageCount =
    lastMessage &&
    lastMessage.senderId !== userId &&
    (!readMessageAt[match.id] || new Date(lastMessage.createdAt) > new Date(readMessageAt[match.id]))
      ? 1
      : 0;

  return unreadNewMatchCount + unreadMessageCount;
}

function getUnreadMatchActivityCount(userId: string, matches: MatchThread[], seedIfNeeded: boolean) {
  if (!isMatchActivityInitialized(userId)) {
    if (seedIfNeeded) {
      seedMatchActivity(userId, matches);
      return 0;
    }

    setMatchActivityInitialized(userId);
  }

  return matches.reduce((total, match) => total + getMatchActivityWeight(userId, match), 0);
}

function markMatchThreadOpened(userId: string, match: MatchThread) {
  const seenMatchIds = getSeenMatchIds(userId);
  const readMessageAt = getReadMatchMessageAt(userId);

  seenMatchIds.add(match.id);

  if (match.lastMessage) {
    readMessageAt[match.id] = match.lastMessage.createdAt;
  }

  saveSeenMatchIds(userId, seenMatchIds);
  saveReadMatchMessageAt(userId, readMessageAt);
  setMatchActivityInitialized(userId);
}

function formatImageUrlForDebug(url: string | null | undefined) {
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

function ProfilePhotoImage({
  photo,
  alt,
  variant = "card",
  priority = false,
  sizes,
  iconSize = "md",
}: {
  photo?: ProfilePhoto;
  alt: string;
  variant?: "thumb" | "card" | "full";
  priority?: boolean;
  sizes: string;
  iconSize?: "sm" | "md" | "lg";
}) {
  const primaryUrl = getProfilePhotoUrl(photo, variant);
  const fallbackUrl = getProfilePhotoFallbackUrl(photo, variant);
  const [failedPrimaryUrl, setFailedPrimaryUrl] = useState<string | null>(null);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const [loadedPhotoUrl, setLoadedPhotoUrl] = useState<string | null>(null);
  const shouldUseFallback = Boolean(
    primaryUrl && fallbackUrl && primaryUrl !== fallbackUrl && failedPrimaryUrl === primaryUrl
  );
  const photoUrl = shouldUseFallback ? fallbackUrl : primaryUrl;
  const isLoaded = loadedPhotoUrl === photoUrl;
  const hasTerminalFailure = Boolean(photoUrl && failedPhotoUrl === photoUrl);
  const iconClass = iconSize === "lg" ? "size-12" : iconSize === "sm" ? "size-5" : "size-8";

  if (!photoUrl || hasTerminalFailure) {
    return (
      <div className="grid h-full w-full place-items-center text-[#0fa76e]">
        <Camera className={iconClass} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#d4fae8]">
      {photo?.blurDataUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${photo.blurDataUrl})` }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[#0fa76e]" aria-hidden="true">
          <Camera className={iconClass} />
        </div>
      )}
      <Image
        key={photoUrl}
        src={photoUrl}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover transition-opacity duration-200 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoadedPhotoUrl(photoUrl)}
        onError={() => {
          if (primaryUrl && fallbackUrl && primaryUrl !== fallbackUrl && photoUrl === primaryUrl) {
            if (process.env.NODE_ENV === "development") {
              console.warn("Streetz image failed. Trying signed fallback.", {
                attempted: formatImageUrlForDebug(photoUrl),
                fallback: formatImageUrlForDebug(fallbackUrl),
              });
            }
            setFailedPrimaryUrl(primaryUrl);
            return;
          }

          if (process.env.NODE_ENV === "development") {
            console.warn("Streetz image failed with no remaining fallback.", {
              attempted: formatImageUrlForDebug(photoUrl),
              primary: formatImageUrlForDebug(primaryUrl),
            });
          }
          setFailedPhotoUrl(photoUrl);
        }}
        priority={priority}
        unoptimized
      />
    </div>
  );
}

export default function Home() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StreetzUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEnterApp = useMemo(() => isActiveMember(user), [user]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      window.setTimeout(() => setIsLoadingSession(false), 0);
      return;
    }

    apiRequest<StreetzUser>("/auth/me", {
      headers: {
        Authorization: `Bearer ${savedToken}`,
      },
    })
      .then((sessionUser) => {
        setToken(savedToken);
        setUser(sessionUser);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoadingSession(false));
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingAuth(true);
    setMessage(null);

    try {
      const payload = authMode === "register" ? { displayName, email, password } : { email, password };
      const auth = await apiRequest<AuthResponse>(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      window.localStorage.setItem(TOKEN_KEY, auth.accessToken);
      setToken(auth.accessToken);
      setUser(auth.user);
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to continue.");
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function startSubscription() {
    if (!token) {
      setMessage("Please log in again before paying.");
      return;
    }

    setIsStartingPayment(true);
    setMessage(null);

    try {
      const response = await apiRequest<{
        authorizationUrl?: string;
        alreadyActive?: boolean;
        subscriptionEndsAt?: string;
      }>("/payments/subscription/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.alreadyActive) {
        setUser((current) =>
          current
            ? {
              ...current,
              subscriptionStatus: "ACTIVE",
              subscriptionEndsAt: response.subscriptionEndsAt,
            }
            : current
        );
        return;
      }

      if (!response.authorizationUrl) {
        throw new Error("Paystack did not return a checkout URL.");
      }

      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start payment.");
    } finally {
      setIsStartingPayment(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setAuthMode("login");
  }

  if (isLoadingSession) {
    return <CenteredShell title="Streetz" subtitle="Checking your session" />;
  }

  if (!user) {
    return (
      <AuthShell
        authMode={authMode}
        displayName={displayName}
        email={email}
        password={password}
        message={message}
        isSubmitting={isSubmittingAuth}
        onModeChange={setAuthMode}
        onDisplayNameChange={setDisplayName}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  if (!canEnterApp) {
    return (
      <PaywallShell
        user={user}
        message={message}
        isStartingPayment={isStartingPayment}
        onStartSubscription={startSubscription}
        onLogout={logout}
      />
    );
  }

  return <MemberApp key={user.id} user={user} token={token ?? ""} onLogout={logout} />;
}

function CenteredShell({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-[#0d0d0d]">
      <section className="w-full max-w-sm rounded-[24px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <p className="text-3xl font-semibold text-[#0d0d0d]">{title}</p>
        <p className="mt-2 text-sm font-medium text-[#666666]">{subtitle}</p>
      </section>
    </main>
  );
}

type AuthShellProps = {
  authMode: "login" | "register";
  displayName: string;
  email: string;
  password: string;
  message: string | null;
  isSubmitting: boolean;
  onModeChange: (mode: "login" | "register") => void;
  onDisplayNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function AuthShell({
  authMode,
  displayName,
  email,
  password,
  message,
  isSubmitting,
  onModeChange,
  onDisplayNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-white text-[#0d0d0d]">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-8 md:grid-cols-[1fr_420px] md:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-black/[0.05] bg-[linear-gradient(180deg,#e8faf1_0%,#f0fdf6_34%,#ffffff_100%)] p-6 shadow-[0_2px_4px_rgba(0,0,0,0.03)] md:p-10">
          <div className="inline-flex rounded-full border border-black/[0.05] bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#0fa76e]">
            Lagos Social Membership
          </div>
          <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight text-[#0d0d0d] md:text-6xl">
            Streetz
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#666666] md:text-lg">
            Discover people, join city rooms, and get tickets to curated Nigerian events.
          </p>
        </div>

        <form onSubmit={onSubmit} className="rounded-[24px] border border-black/[0.05] bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
          <div className="grid grid-cols-2 rounded-full border border-black/[0.05] bg-[#fafafa] p-1 text-sm font-medium">
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${authMode === "login" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => onModeChange("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${authMode === "register" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => onModeChange("register")}
            >
              Create
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            {authMode === "register" ? (
              <label className="grid gap-2 text-sm font-medium">
                Display name
                <input
                  className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  value={displayName}
                  onChange={(event) => onDisplayNameChange(event.target.value)}
                  minLength={2}
                  required
                />
              </label>
            ) : null}

            <label className="grid gap-2 text-sm font-medium">
              Email
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                required
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Password
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                minLength={8}
                required
              />
            </label>
          </div>

          {message ? <p className="mt-4 rounded-[16px] bg-[#fff8e9] p-3 text-sm font-medium text-[#8a5a08]">{message}</p> : null}

          <button
            type="submit"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isSubmitting ? "Please wait" : authMode === "register" ? "Create account" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

function PaywallShell({
  user,
  message,
  isStartingPayment,
  onStartSubscription,
  onLogout,
}: {
  user: StreetzUser;
  message: string | null;
  isStartingPayment: boolean;
  onStartSubscription: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-8 text-[#0d0d0d]">
      <section className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <div className="bg-[linear-gradient(180deg,#e8faf1_0%,#ffffff_100%)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold">Streetz</p>
              <p className="mt-2 text-sm font-medium text-[#666666]">{user.displayName}</p>
            </div>
            <button
              className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#0d0d0d]"
              onClick={onLogout}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
          <h1 className="mt-10 text-3xl font-semibold leading-tight md:text-5xl">Unlock Streetz for ₦1,000/month.</h1>
        </div>

        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Discovery", icon: Heart },
              { label: "Matches", icon: MessagesSquare },
              { label: "Profile", icon: UserRound },
              { label: "Rooms", icon: MessageCircle },
              { label: "Events", icon: Ticket },
            ].map((item) => (
              <div key={item.label} className="rounded-[16px] border border-black/[0.05] p-4">
                <item.icon className="size-5 text-[#0fa76e]" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">{item.label}</p>
              </div>
            ))}
          </div>

          {message ? <p className="mt-4 rounded-[16px] bg-[#fff8e9] p-3 text-sm font-medium text-[#8a5a08]">{message}</p> : null}

          <button
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#18E299] px-5 text-sm font-medium text-[#0d0d0d] shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onStartSubscription}
            disabled={isStartingPayment}
          >
            {isStartingPayment ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isStartingPayment ? "Opening Paystack" : "Pay with Paystack"}
          </button>
        </div>
      </section>
    </main>
  );
}

function MemberApp({ user, token, onLogout }: { user: StreetzUser; token: string; onLogout: () => void }) {
  const shouldRequireProfileSetup = user.role === "USER";
  const [activeTab, setActiveTab] = useState<TabKey>("discovery");
  const [profileGateState, setProfileGateState] = useState<ProfileGateState>(
    shouldRequireProfileSetup ? "checking" : "ready"
  );
  const [profileGateNotice, setProfileGateNotice] = useState<string | null>(null);
  const [matchActivityCount, setMatchActivityCount] = useState(0);

  function handleProfileReady() {
    setProfileGateNotice(null);
    setProfileGateState("ready");
    setActiveTab("discovery");
    void refreshMatchActivity({ seedIfNeeded: true });
  }

  async function refreshMatchActivity(options: { seedIfNeeded?: boolean } = {}) {
    const { seedIfNeeded = false } = options;

    try {
      const response = await apiRequest<{ matches: MatchThread[] }>("/matches", {
        headers: authHeaders(token),
      });

      setMatchActivityCount(getUnreadMatchActivityCount(user.id, response.matches, seedIfNeeded));
    } catch {
      // Match activity is decorative; the tab itself will show any fetch errors when opened.
    }
  }

  function handleMatchCreated() {
    setMatchActivityCount((current) => current + 1);
    void refreshMatchActivity({ seedIfNeeded: false });
  }

  function handleMatchesLoaded(matches: MatchThread[]) {
    setMatchActivityCount(getUnreadMatchActivityCount(user.id, matches, true));
  }

  function handleMatchOpened(match: MatchThread) {
    const activityWeight = getMatchActivityWeight(user.id, match);

    markMatchThreadOpened(user.id, match);

    if (activityWeight > 0) {
      setMatchActivityCount((current) => Math.max(0, current - activityWeight));
    }
  }

  useEffect(() => {
    if (!shouldRequireProfileSetup) {
      return undefined;
    }

    let cancelled = false;

    async function checkProfileGate() {
      try {
        const profileResponse = await apiRequest<StreetzProfile | null>("/profiles/me", {
          headers: authHeaders(token),
        });

        if (cancelled) {
          return;
        }

        if (isProfileReadyForDiscovery(profileResponse)) {
          setProfileGateNotice(null);
          setProfileGateState("ready");
          return;
        }

        setActiveTab("profile");
        setProfileGateNotice(null);
        setProfileGateState("required");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setActiveTab("profile");
        setProfileGateNotice(error instanceof Error ? error.message : "Unable to verify your profile setup.");
        setProfileGateState("required");
      }
    }

    void checkProfileGate();

    return () => {
      cancelled = true;
    };
  }, [token, shouldRequireProfileSetup]);

  useEffect(() => {
    if (profileGateState !== "ready") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void refreshMatchActivity({ seedIfNeeded: true });
    }, 0);

    const interval = window.setInterval(() => {
      void refreshMatchActivity({ seedIfNeeded: false });
    }, 30000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user.id, profileGateState]);

  return (
    <main className="min-h-screen bg-white text-[#0d0d0d]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-black/[0.05] bg-white px-4 py-5 md:block">
          <AppBrand user={user} onLogout={onLogout} />
          {profileGateState === "ready" ? (
            <nav className="mt-8 grid gap-2">
              {tabs.map((tab) => (
                <AppNavButton
                  key={tab.id}
                  tab={tab}
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  variant="side"
                  badgeCount={tab.id === "matches" ? matchActivityCount : 0}
                />
              ))}
            </nav>
          ) : (
            <div className="mt-8 rounded-[18px] bg-[#d4fae8] p-4 text-sm font-medium leading-6 text-[#0b7a50]">
              Complete your profile setup to unlock discovery, matches, rooms, and events.
            </div>
          )}
        </aside>

        <section className={`min-w-0 flex-1 ${profileGateState === "ready" ? "pb-24 md:pb-0" : "pb-8"}`}>
          <MobileHeader user={user} onLogout={onLogout} />
          {profileGateState === "checking" ? (
            <div className="px-5 py-8 md:px-8">
              <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05]">
                <div className="text-center">
                  <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-[#666666]">Checking profile setup</p>
                </div>
              </div>
            </div>
          ) : profileGateState === "required" ? (
            <ProfileTab
              token={token}
              user={user}
              mode="setup"
              setupNotice={profileGateNotice}
              onProfileReady={handleProfileReady}
            />
          ) : (
            <>
              {activeTab === "discovery" ? <DiscoveryTab token={token} onMatchCreated={handleMatchCreated} /> : null}
              {activeTab === "matches" ? (
                <MatchesTab
                  token={token}
                  user={user}
                  onMatchesLoaded={handleMatchesLoaded}
                  onMatchOpened={handleMatchOpened}
                />
              ) : null}
              {activeTab === "profile" ? <ProfileTab token={token} user={user} /> : null}
              {activeTab === "rooms" ? <RoomsTab /> : null}
              {activeTab === "events" ? <EventsTab /> : null}
            </>
          )}
        </section>
      </div>

      {profileGateState === "ready" ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/[0.05] bg-white/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
            {tabs.map((tab) => (
              <AppNavButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                variant="bottom"
                badgeCount={tab.id === "matches" ? matchActivityCount : 0}
              />
            ))}
          </div>
        </nav>
      ) : null}
    </main>
  );
}

function AppBrand({ user, onLogout }: { user: StreetzUser; onLogout: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold">Streetz</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{user.role}</p>
        </div>
        <button
          className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
          onClick={onLogout}
          aria-label="Logout"
          title="Logout"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 rounded-[16px] border border-black/[0.05] bg-[#fafafa] p-4">
        <p className="text-sm font-medium">{user.displayName}</p>
        <p className="mt-1 truncate text-xs text-[#666666]">{user.email}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#d4fae8] px-3 py-1 text-xs font-medium text-[#0fa76e]">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Active
        </div>
      </div>
    </div>
  );
}

function MobileHeader({ user, onLogout }: { user: StreetzUser; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-black/[0.05] bg-white/90 px-5 py-4 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold">Streetz</p>
          <p className="text-xs font-medium text-[#666666]">{user.displayName}</p>
        </div>
        <button
          className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
          onClick={onLogout}
          aria-label="Logout"
          title="Logout"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function AppNavButton({
  tab,
  active,
  onClick,
  variant,
  badgeCount = 0,
}: {
  tab: { id: TabKey; label: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
  variant: "side" | "bottom";
  badgeCount?: number;
}) {
  const Icon = tab.icon;
  const base = "inline-flex items-center justify-center gap-2 text-sm font-medium transition";
  const activeClass = active ? "bg-[#0d0d0d] text-white" : "text-[#666666] hover:text-[#0d0d0d]";
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);
  const badge =
    badgeCount > 0 ? (
      <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-[#18E299] px-1 text-[10px] font-semibold leading-5 text-[#0d0d0d] shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
        {badgeLabel}
      </span>
    ) : null;

  if (variant === "side") {
    return (
      <button className={`${base} ${activeClass} h-11 rounded-full px-4`} onClick={onClick}>
        <span className="relative inline-flex">
          <Icon className="size-4" aria-hidden="true" />
          {badge}
        </span>
        <span>{tab.label}</span>
      </button>
    );
  }

  return (
    <button className={`${base} ${activeClass} min-h-14 rounded-[20px] px-2 py-2`} onClick={onClick}>
      <span className="grid justify-items-center gap-1">
        <span className="relative inline-flex">
          <Icon className="size-5" aria-hidden="true" />
          {badge}
        </span>
        <span className="text-xs">{tab.label}</span>
      </span>
    </button>
  );
}

function ScreenHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-6 md:px-8 md:pt-8">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight text-[#0d0d0d] md:text-5xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

function ProfileTab({
  token,
  user,
  mode = "normal",
  setupNotice,
  onProfileReady,
}: {
  token: string;
  user: StreetzUser;
  mode?: ProfileTabMode;
  setupNotice?: string | null;
  onProfileReady?: (profile: StreetzProfile) => void;
}) {
  const isSetupMode = mode === "setup";
  const [profile, setProfile] = useState<StreetzProfile | null>(null);
  const [profileView, setProfileView] = useState<"overview" | "edit" | "preview">(
    isSetupMode ? "edit" : "overview"
  );
  const [activeProfilePhotoIndex, setActiveProfilePhotoIndex] = useState(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [uploadingPhotoSlot, setUploadingPhotoSlot] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    bio: "",
    birthDate: "",
    gender: "PREFER_NOT_TO_SAY" as Gender,
    connectionStatus: "" as ConnectionStatus | "",
    city: "",
    state: "",
    interests: "",
  });

  const profilePhotos = profile?.user.photos ?? [];
  const visibleProfilePhotos = profilePhotos.slice(0, PROFILE_PHOTO_LIMIT);
  const profilePhoto = visibleProfilePhotos[0];
  const safeActiveProfilePhotoIndex =
    activeProfilePhotoIndex < visibleProfilePhotos.length ? activeProfilePhotoIndex : 0;
  const activeProfilePhoto = visibleProfilePhotos[safeActiveProfilePhotoIndex] ?? profilePhoto;
  const isUploadingPhoto = uploadingPhotoSlot !== null;
  const nextAvailablePhotoSlot = Math.min(visibleProfilePhotos.length, PROFILE_PHOTO_LIMIT - 1);
  const profileAge = getAgeFromBirthDate(profileForm.birthDate);
  const profileLocation = [profileForm.city, profileForm.state].filter(Boolean).join(", ") || "Nigeria";
  const profileStatusLabel = profileForm.connectionStatus ? formatConnectionStatus(profileForm.connectionStatus) : "Set status";
  const previewInterests = profileForm.interests
    .split(",")
    .map((interest) => interest.trim())
    .filter(Boolean);

  function syncProfileForm(profileResponse: StreetzProfile) {
    setProfileForm({
      bio: profileResponse.bio ?? "",
      birthDate: profileResponse.birthDate ? profileResponse.birthDate.slice(0, 10) : "",
      gender: profileResponse.gender ?? "PREFER_NOT_TO_SAY",
      connectionStatus: profileResponse.connectionStatus ?? "",
      city: profileResponse.city ?? "",
      state: profileResponse.state ?? "",
      interests: profileResponse.interests.join(", "),
    });
  }

  async function loadProfile(options: { clearNotice?: boolean; showLoading?: boolean } = {}) {
    const { clearNotice = true, showLoading = true } = options;

    if (showLoading) {
      setIsLoadingProfile(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const profileResponse = await apiRequest<StreetzProfile | null>("/profiles/me", {
        headers: authHeaders(token),
      });

      setProfile(profileResponse);

      if (profileResponse) {
        syncProfileForm(profileResponse);

        if (isSetupMode) {
          setProfileView("edit");
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load profile.");
    } finally {
      if (showLoading) {
        setIsLoadingProfile(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!setupNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setNotice(setupNotice);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [setupNotice]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (isSetupMode) {
      const setupIssues = getProfileSetupIssuesFromForm(profileForm, visibleProfilePhotos.length);

      if (setupIssues.length > 0) {
        setNotice(`To continue, ${formatProfileSetupIssues(setupIssues)}.`);
        return;
      }
    }

    setIsSavingProfile(true);

    try {
      const savedProfile = await apiRequest<StreetzProfile>("/profiles/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({
          bio: profileForm.bio,
          birthDate: profileForm.birthDate || undefined,
          gender: profileForm.gender,
          connectionStatus: profileForm.connectionStatus || undefined,
          city: profileForm.city,
          state: profileForm.state,
          interests: profileForm.interests
            .split(",")
            .map((interest) => interest.trim())
            .filter(Boolean),
        }),
      });

      setProfile(savedProfile);
      syncProfileForm(savedProfile);

      if (isSetupMode) {
        if (!isProfileReadyForDiscovery(savedProfile)) {
          const setupIssues = getProfileSetupIssues(savedProfile);
          setNotice(`To continue, ${formatProfileSetupIssues(setupIssues)}.`);
          return;
        }

        onProfileReady?.(savedProfile);
        return;
      }

      setProfileView("overview");
      setNotice("Profile saved.");
      void loadProfile({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function uploadProfilePhoto(event: ChangeEvent<HTMLInputElement>, sortOrder = nextAvailablePhotoSlot) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (visibleProfilePhotos.length >= PROFILE_PHOTO_LIMIT) {
      setNotice(`You can add up to ${PROFILE_PHOTO_LIMIT} profile photos.`);
      input.value = "";
      return;
    }

    setUploadingPhotoSlot(sortOrder);
    setNotice(null);

    try {
      const upload = await apiRequest<{
        uploadUrl: string;
        objectKey: string;
      }>("/profiles/photos/presign", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      });

      const uploadResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("S3 rejected the photo upload. Check the bucket CORS settings.");
      }

      await apiRequest<ProfilePhoto>("/profiles/photos", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          objectKey: upload.objectKey,
          sortOrder,
        }),
      });

      setActiveProfilePhotoIndex(Math.min(sortOrder, PROFILE_PHOTO_LIMIT - 1));
      setNotice("Photo added to your profile.");
      await loadProfile({ clearNotice: false, showLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload photo.";
      setNotice(
        message === "Failed to fetch"
          ? "S3 upload failed. Add localhost to the bucket CORS settings, then try again."
          : message
      );
    } finally {
      setUploadingPhotoSlot(null);
      input.value = "";
    }
  }

  function closeProfileEditor() {
    if (profile) {
      syncProfileForm(profile);
    }

    setProfileView("overview");
    setNotice(null);
  }

  return (
    <section>
      {profileView === "overview" && !isSetupMode ? (
        <ScreenHeader
          eyebrow="Profile"
          title="Your Streetz profile."
          action={
            <div className="hidden items-center rounded-full bg-[#d4fae8] px-4 py-2 text-sm font-medium text-[#0fa76e] md:inline-flex">
              Discoverable
            </div>
          }
        />
      ) : (
        <>
          {!isSetupMode ? (
            <div className="px-5 pt-5 md:px-8 md:pt-8">
              <button
                className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#0d0d0d]"
                onClick={closeProfileEditor}
                aria-label="Back to profile"
                title="Back"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <ScreenHeader
            eyebrow={isSetupMode ? "Profile setup" : "Profile"}
            title={
              isSetupMode
                ? "Setup your profile first."
                : profileView === "edit"
                  ? "Edit your profile."
                  : "Preview your discovery card."
            }
          />
        </>
      )}

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingProfile ? (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05]">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading profile</p>
            </div>
          </div>
        ) : (
          <div className={profileView === "edit" ? "mx-auto max-w-2xl" : "mx-auto max-w-[520px]"}>
            {profileView === "edit" ? (
              <form onSubmit={saveProfile} className="space-y-5">
                <section className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Profile photos</h2>
                      <p className="mt-1 text-sm leading-6 text-[#666666]">Add one main photo, then up to three more.</p>
                    </div>
                    <span className="rounded-full bg-[#d4fae8] px-3 py-1 text-xs font-medium text-[#0fa76e]">
                      {Math.min(visibleProfilePhotos.length, PROFILE_PHOTO_LIMIT)}/{PROFILE_PHOTO_LIMIT}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: PROFILE_PHOTO_LIMIT }).map((_, index) => {
                      const photo = visibleProfilePhotos[index];
                      const isOpenSlot = !photo && index === nextAvailablePhotoSlot && visibleProfilePhotos.length < PROFILE_PHOTO_LIMIT;
                      const isLockedSlot = !photo && !isOpenSlot;

                      return (
                        <div
                          key={photo?.id ?? `photo-slot-${index}`}
                          className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-black/[0.06] bg-[#d4fae8]"
                        >
                          {photo ? (
                            <ProfilePhotoImage
                              photo={photo}
                              alt={`${user.displayName} photo ${index + 1}`}
                              variant="card"
                              sizes="(max-width: 640px) 50vw, 160px"
                              iconSize="md"
                            />
                          ) : (
                            <div className="grid h-full place-items-center px-3 text-center text-[#0fa76e]">
                              <div>
                                <Camera className="mx-auto size-7" aria-hidden="true" />
                                <p className="mt-2 text-xs font-medium">{index === 0 ? "Main photo" : `Photo ${index + 1}`}</p>
                              </div>
                            </div>
                          )}

                          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#0d0d0d]">
                            {index === 0 ? "Main" : `Photo ${index + 1}`}
                          </span>

                          {isOpenSlot ? (
                            <label className="absolute inset-0 grid cursor-pointer place-items-center bg-black/10 text-white">
                              {uploadingPhotoSlot === index ? (
                                <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                              ) : (
                                <span className="rounded-full bg-[#0d0d0d] px-3 py-1.5 text-xs font-medium">Add photo</span>
                              )}
                              <input
                                className="sr-only"
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(event) => uploadProfilePhoto(event, index)}
                                disabled={isUploadingPhoto}
                              />
                            </label>
                          ) : null}

                          {isLockedSlot ? (
                            <div className="absolute inset-0 grid place-items-center bg-white/50 px-3 text-center text-[11px] font-medium text-[#777777]">
                              Fill previous slot first
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                  <div className="flex items-start gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-[18px] bg-[#d4fae8]">
                      <ProfilePhotoImage photo={profilePhoto} alt={`${user.displayName} profile`} variant="thumb" sizes="64px" iconSize="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold">Profile details</p>
                      <p className="mt-1 text-sm text-[#666666]">Used for discovery and matches</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <textarea
                      className="min-h-24 rounded-[18px] border border-black/[0.08] p-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                      placeholder="Bio"
                      value={profileForm.bio}
                      onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))}
                      maxLength={500}
                      required={isSetupMode}
                    />
                    <select
                      className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                      value={profileForm.connectionStatus}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          connectionStatus: event.target.value as ConnectionStatus | "",
                        }))
                      }
                      required={isSetupMode}
                    >
                      <option value="" disabled>
                        Choose status
                      </option>
                      {connectionStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        type="date"
                        value={profileForm.birthDate}
                        onChange={(event) => setProfileForm((current) => ({ ...current, birthDate: event.target.value }))}
                        required={isSetupMode}
                      />
                      <select
                        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        value={profileForm.gender}
                        onChange={(event) => setProfileForm((current) => ({ ...current, gender: event.target.value as Gender }))}
                      >
                        <option value="WOMAN">Woman</option>
                        <option value="MAN">Man</option>
                        <option value="NON_BINARY">Non-binary</option>
                        <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                      </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        placeholder="City"
                        value={profileForm.city}
                        onChange={(event) => setProfileForm((current) => ({ ...current, city: event.target.value }))}
                        required={isSetupMode}
                      />
                      <input
                        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        placeholder="State"
                        value={profileForm.state}
                        onChange={(event) => setProfileForm((current) => ({ ...current, state: event.target.value }))}
                        required={isSetupMode}
                      />
                    </div>
                    <input
                      className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                      placeholder="Interests, comma separated"
                      value={profileForm.interests}
                      onChange={(event) => setProfileForm((current) => ({ ...current, interests: event.target.value }))}
                      required={isSetupMode}
                    />
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSavingProfile}
                    >
                      {isSavingProfile ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                      {isSetupMode ? "Complete setup" : "Save"}
                    </button>
                  </div>
                </section>
              </form>
            ) : profileView === "preview" ? (
              <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                <div className="relative aspect-[4/5] min-h-[420px] bg-[#d4fae8]">
                  <ProfilePhotoImage
                    photo={profilePhoto}
                    alt={`${user.displayName} profile preview`}
                    variant="full"
                    sizes="(max-width: 768px) 100vw, 430px"
                    iconSize="lg"
                  />
                  {visibleProfilePhotos.length > 1 ? (
                    <div className="absolute inset-x-4 top-4 flex gap-1.5">
                      {visibleProfilePhotos.map((photo, index) => (
                        <span
                          key={photo.id}
                          className={`h-1 flex-1 rounded-full ${index === 0 ? "bg-white" : "bg-white/45"}`}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white">
                    <div className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                      {profileStatusLabel}
                    </div>
                    <h2 className="mt-3 text-3xl font-semibold">
                      {user.displayName}
                      {profileAge ? `, ${profileAge}` : ""}
                    </h2>
                    <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                      <MapPin className="size-4" aria-hidden="true" />
                      {profileLocation}
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  {profileForm.bio ? (
                    <p className="text-sm leading-6 text-[#444444]">{profileForm.bio}</p>
                  ) : (
                    <p className="text-sm leading-6 text-[#777777]">Add a short bio so people know what kind of city link you are looking for.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewInterests.slice(0, 5).map((interest) => (
                      <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ) : (
              <>
                <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                  <div className="relative aspect-[1.05] min-h-[320px] bg-[#d4fae8]">
                    <ProfilePhotoImage
                      photo={activeProfilePhoto}
                      alt={`${user.displayName} profile`}
                      variant="full"
                      sizes="(max-width: 768px) 100vw, 520px"
                      iconSize="lg"
                    />
                    <div className="absolute left-4 top-4 inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                      {profileStatusLabel}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 p-3">
                    {Array.from({ length: PROFILE_PHOTO_LIMIT }).map((_, index) => {
                      const photo = visibleProfilePhotos[index];
                      const isActive = index === safeActiveProfilePhotoIndex;

                      return photo ? (
                        <button
                          key={photo.id}
                          className={`relative aspect-square overflow-hidden rounded-[16px] border ${
                            isActive ? "border-[#18E299] ring-2 ring-[#18E299]/30" : "border-black/[0.06]"
                          }`}
                          type="button"
                          onClick={() => setActiveProfilePhotoIndex(index)}
                          aria-label={`Show photo ${index + 1}`}
                        >
                          <ProfilePhotoImage
                            photo={photo}
                            alt={`${user.displayName} thumbnail ${index + 1}`}
                            variant="thumb"
                            sizes="96px"
                            iconSize="sm"
                          />
                        </button>
                      ) : (
                        <div
                          key={`empty-overview-photo-${index}`}
                          className="grid aspect-square place-items-center rounded-[16px] border border-dashed border-black/[0.12] bg-[#fafafa] text-[#999999]"
                        >
                          <Camera className="size-4" aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-5 pb-5 pt-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-3xl font-semibold text-[#0d0d0d]">
                          {user.displayName}
                          {profileAge ? `, ${profileAge}` : ""}
                        </h2>
                        <p className="mt-2 flex items-center gap-1 text-sm font-medium text-[#666666]">
                          <MapPin className="size-4" aria-hidden="true" />
                          {profileLocation}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#d4fae8] px-3 py-1 text-xs font-medium text-[#0fa76e]">
                        {visibleProfilePhotos.length} photo{visibleProfilePhotos.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Status</p>
                      <p className="mt-2 text-sm font-medium text-[#444444]">{profileStatusLabel}</p>
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Bio</p>
                      <p className="mt-2 text-sm leading-6 text-[#444444]">
                        {profileForm.bio || "Add a short bio so people know what kind of city link you are looking for."}
                      </p>
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Interests</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {previewInterests.length > 0 ? (
                          previewInterests.slice(0, 8).map((interest) => (
                            <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
                              {interest}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-[#777777]">No interests added yet.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>

                <div className="mt-5 grid gap-3">
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-5 text-sm font-medium text-[#0d0d0d]"
                    type="button"
                    onClick={() => setProfileView("preview")}
                  >
                    <Heart className="size-4" aria-hidden="true" />
                    Preview Card
                  </button>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
                    type="button"
                    onClick={() => setProfileView("edit")}
                  >
                    <UserRound className="size-4" aria-hidden="true" />
                    Edit Profile
                  </button>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-5 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-55"
                    type="button"
                    disabled
                  >
                    <Power className="size-4" aria-hidden="true" />
                    Deactivate Profile
                  </button>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-55"
                    type="button"
                    disabled
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete Profile
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DiscoveryTab({ token, onMatchCreated }: { token: string; onMatchCreated: () => void }) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [viewedCandidate, setViewedCandidate] = useState<DiscoveryCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefilling, setIsRefilling] = useState(false);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number; candidateId: string; startedAt: number } | null>(null);
  const swipeLatestOffsetRef = useRef({ x: 0, y: 0 });
  const dismissedCandidateIdsRef = useRef<Set<string>>(new Set());
  const refillRequestRef = useRef(false);
  const removalTimersRef = useRef<number[]>([]);

  const activeCandidate = candidates[0];
  const isActingOnActiveCandidate = activeCandidate ? actionTargetId === activeCandidate.id : false;
  const swipeIntent = dragOffset.x > 60 ? "LIKE" : dragOffset.x < -60 ? "PASS" : null;
  const renderedCandidates = candidates.slice(0, DISCOVERY_RENDERED_STACK_SIZE);
  const swipeCardStyle: CSSProperties = {
    transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${dragOffset.x / 18}deg)`,
    transition: isDraggingCard ? "none" : "transform 180ms ease",
  };

  async function loadDiscovery(options: { clearNotice?: boolean; mode?: "append" | "replace"; showLoading?: boolean } = {}) {
    const { clearNotice = true, mode = "replace", showLoading = true } = options;

    if (showLoading) {
      setIsLoading(true);
    } else {
      refillRequestRef.current = true;
      setIsRefilling(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const candidatesResponse = await apiRequest<{ candidates: DiscoveryCandidate[] }>("/discovery/candidates", {
        headers: authHeaders(token),
      });
      const availableCandidates = candidatesResponse.candidates.filter(
        (candidate) => !dismissedCandidateIdsRef.current.has(candidate.id)
      );

      setCandidates((current) =>
        mode === "append"
          ? mergeCandidateDeck(current, availableCandidates, dismissedCandidateIdsRef.current)
          : availableCandidates.slice(0, DISCOVERY_DECK_SIZE)
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load discovery.");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      } else {
        refillRequestRef.current = false;
        setIsRefilling(false);
      }
    }
  }

  useEffect(() => {
    dismissedCandidateIdsRef.current = new Set();
    const timer = window.setTimeout(() => {
      void loadDiscovery();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const activeRemovalTimers = removalTimersRef.current;

    return () => {
      for (const timer of activeRemovalTimers) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDragOffset({ x: 0, y: 0 });
      swipeLatestOffsetRef.current = { x: 0, y: 0 };
      setIsDraggingCard(false);
      swipeStartRef.current = null;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeCandidate?.id]);

  useEffect(() => {
    const preloadUrls = candidates
      .slice(0, DISCOVERY_DECK_SIZE)
      .flatMap((candidate) => [getCandidatePhotoUrl(candidate, "card"), getCandidatePhotoUrl(candidate, "thumb")])
      .filter((url): url is string => Boolean(url));

    for (const url of Array.from(new Set(preloadUrls))) {
      const image = new window.Image();
      image.decoding = "async";
      image.src = url;
      void image.decode?.().catch(() => undefined);
    }
  }, [candidates]);

  useEffect(() => {
    if (isLoading || isRefilling || refillRequestRef.current || candidates.length === 0 || candidates.length > DISCOVERY_REFILL_THRESHOLD) {
      return;
    }

    void loadDiscovery({ clearNotice: false, mode: "append", showLoading: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length, isLoading, isRefilling]);

  async function persistDiscoveryAction(candidate: DiscoveryCandidate, action: DiscoveryActionName) {
    try {
      const result = await apiRequest<{ matched: boolean }>("/discovery/actions", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          targetUserId: candidate.id,
          action,
        }),
      });

      if (result.matched) {
        onMatchCreated();
      }
    } catch (error) {
      dismissedCandidateIdsRef.current.delete(candidate.id);
      setNotice(error instanceof Error ? error.message : "Unable to update discovery.");
      void loadDiscovery({ clearNotice: false, mode: "append", showLoading: false });
    }
  }

  function recordDiscoveryAction(candidate: DiscoveryCandidate, action: DiscoveryActionName, exitOffset = { x: action === "LIKE" ? 640 : -640, y: 0 }) {
    if (actionTargetId === candidate.id || dismissedCandidateIdsRef.current.has(candidate.id)) {
      return;
    }

    dismissedCandidateIdsRef.current.add(candidate.id);
    setActionTargetId(candidate.id);
    setNotice(null);
    setIsDraggingCard(false);
    swipeStartRef.current = null;
    swipeLatestOffsetRef.current = { x: 0, y: 0 };
    setDragOffset(exitOffset);

    const removalTimer = window.setTimeout(() => {
      setCandidates((current) => current.filter((currentCandidate) => currentCandidate.id !== candidate.id));
      setActionTargetId((current) => (current === candidate.id ? null : current));
      setDragOffset({ x: 0, y: 0 });
      removalTimersRef.current = removalTimersRef.current.filter((timer) => timer !== removalTimer);
    }, DISCOVERY_EXIT_TRANSITION_MS);

    removalTimersRef.current.push(removalTimer);
    void persistDiscoveryAction(candidate, action);
  }

  function resetSwipeCard() {
    swipeStartRef.current = null;
    swipeLatestOffsetRef.current = { x: 0, y: 0 };
    setIsDraggingCard(false);
    setDragOffset({ x: 0, y: 0 });
  }

  function finishSwipeGesture(finalOffset: { x: number; y: number }, endedAt: number) {
    const start = swipeStartRef.current;

    if (!activeCandidate || !start || start.candidateId !== activeCandidate.id || isActingOnActiveCandidate) {
      resetSwipeCard();
      return;
    }

    const elapsedMs = Math.max(1, endedAt - start.startedAt);
    const horizontalVelocity = Math.abs(finalOffset.x) / elapsedMs;
    const isMostlyHorizontal = Math.abs(finalOffset.x) > Math.abs(finalOffset.y) * 1.15;
    const isDistanceSwipe = Math.abs(finalOffset.x) >= DISCOVERY_SWIPE_DISTANCE;
    const isFlickSwipe =
      Math.abs(finalOffset.x) >= DISCOVERY_SWIPE_FLICK_DISTANCE &&
      horizontalVelocity >= DISCOVERY_SWIPE_FLICK_VELOCITY;

    swipeStartRef.current = null;
    setIsDraggingCard(false);

    if (!isMostlyHorizontal || (!isDistanceSwipe && !isFlickSwipe)) {
      swipeLatestOffsetRef.current = { x: 0, y: 0 };
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    const action = finalOffset.x > 0 ? "LIKE" : "PASS";
    recordDiscoveryAction(activeCandidate, action, {
      x: action === "LIKE" ? 640 : -640,
      y: finalOffset.y,
    });
  }

  function handleSwipeStart(event: PointerEvent<HTMLElement>) {
    if (!activeCandidate || isActingOnActiveCandidate) {
      return;
    }

    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      candidateId: activeCandidate.id,
      startedAt: event.timeStamp,
    };
    swipeLatestOffsetRef.current = { x: 0, y: 0 };
    setIsDraggingCard(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSwipeMove(event: PointerEvent<HTMLElement>) {
    const start = swipeStartRef.current;

    if (!activeCandidate || !start || start.candidateId !== activeCandidate.id || isActingOnActiveCandidate) {
      return;
    }

    const nextOffset = {
      x: event.clientX - start.x,
      y: event.clientY - start.y,
    };

    if (Math.abs(nextOffset.x) > 8) {
      event.preventDefault();
    }

    swipeLatestOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function handleSwipeEnd(event: PointerEvent<HTMLElement>) {
    const start = swipeStartRef.current;

    if (!start) {
      resetSwipeCard();
      return;
    }

    finishSwipeGesture({
      x: event.clientX - start.x,
      y: event.clientY - start.y,
    }, event.timeStamp);
  }

  function handleSwipeInterrupted(event: PointerEvent<HTMLElement>) {
    if (!swipeStartRef.current) {
      return;
    }

    finishSwipeGesture(swipeLatestOffsetRef.current, event.timeStamp);
  }

  async function blockCandidate(targetUserId: string) {
    if (!window.confirm("Block this profile?")) {
      return;
    }

    setActionTargetId(targetUserId);

    try {
      await apiRequest("/discovery/block", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ targetUserId }),
      });
      setCandidates((current) => current.filter((candidate) => candidate.id !== targetUserId));
      setNotice("Profile blocked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to block profile.");
    } finally {
      setActionTargetId(null);
    }
  }

  async function reportCandidate(targetUserId: string) {
    const reason = window.prompt("Why are you reporting this profile?");

    if (!reason) {
      return;
    }

    setActionTargetId(targetUserId);

    try {
      await apiRequest("/discovery/report", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          targetUserId,
          reason,
        }),
      });
      setNotice("Report sent.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to report profile.");
    } finally {
      setActionTargetId(null);
    }
  }

  if (viewedCandidate) {
    return <MemberProfileView candidate={viewedCandidate} onBack={() => setViewedCandidate(null)} backLabel="Back to discovery" />;
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Discovery"
        title="Find your next city link."
        action={
          <button className="hidden h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium md:inline-flex">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filters
          </button>
        }
      />

      <div className="px-5 md:px-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(360px,520px)_1fr]">
          {isLoading ? (
            <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)] xl:max-w-[520px]">
              <div className="grid min-h-[520px] place-items-center p-6 text-center">
                <div>
                  <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-[#666666]">Loading discovery</p>
                </div>
              </div>
            </article>
          ) : renderedCandidates.length > 0 ? (
            <div className="relative min-h-[700px] xl:max-w-[520px]">
              {renderedCandidates.map((candidate, index) => {
                const isTopCard = index === 0;
                const stackStyle: CSSProperties = isTopCard
                  ? { ...swipeCardStyle, zIndex: DISCOVERY_RENDERED_STACK_SIZE + 1 }
                  : {
                      opacity: 1 - index * 0.08,
                      transform: `translate3d(0, ${index * 14}px, 0) scale(${1 - index * 0.035})`,
                      transition: "transform 220ms ease, opacity 220ms ease",
                      zIndex: DISCOVERY_RENDERED_STACK_SIZE - index,
                    };

                return (
                  <article
                    key={candidate.id}
                    aria-hidden={!isTopCard}
                    className={`absolute inset-x-0 top-0 overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${
                      isTopCard ? "touch-pan-y select-none" : "pointer-events-none"
                    } ${isTopCard && isDraggingCard ? "cursor-grabbing" : isTopCard ? "cursor-grab" : ""}`}
                    style={stackStyle}
                    onPointerDown={isTopCard ? handleSwipeStart : undefined}
                    onPointerMove={isTopCard ? handleSwipeMove : undefined}
                    onPointerUp={isTopCard ? handleSwipeEnd : undefined}
                    onPointerCancel={isTopCard ? handleSwipeInterrupted : undefined}
                    onLostPointerCapture={isTopCard ? handleSwipeInterrupted : undefined}
                  >
                    <DiscoveryCandidateCard
                      candidate={candidate}
                      isActionDisabled={isTopCard ? actionTargetId === candidate.id : true}
                      onBlock={() => blockCandidate(candidate.id)}
                      onLike={() => recordDiscoveryAction(candidate, "LIKE")}
                      onPass={() => recordDiscoveryAction(candidate, "PASS")}
                      onReport={() => reportCandidate(candidate.id)}
                      onViewProfile={() => setViewedCandidate(candidate)}
                      priority={isTopCard}
                      swipeIntent={isTopCard ? swipeIntent : null}
                    />
                  </article>
                );
              })}
            </div>
          ) : (
            <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)] xl:max-w-[520px]">
              <div className="grid min-h-[520px] place-items-center p-6 text-center">
                <div>
                  <Heart className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                  <h2 className="mt-3 text-2xl font-semibold">No other profiles yet</h2>
                  <p className="mt-2 text-sm leading-6 text-[#666666]">
                    Your profile is live for other members. You will see people here as more subscribed users go live.
                  </p>
                  <button
                    className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/[0.08] px-5 text-sm font-medium"
                    onClick={() => loadDiscovery()}
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    Refresh
                  </button>
                </div>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function DiscoveryCandidateCard({
  candidate,
  isActionDisabled,
  onBlock,
  onLike,
  onPass,
  onReport,
  onViewProfile,
  priority,
  swipeIntent,
}: {
  candidate: DiscoveryCandidate;
  isActionDisabled: boolean;
  onBlock: () => void;
  onLike: () => void;
  onPass: () => void;
  onReport: () => void;
  onViewProfile: () => void;
  priority: boolean;
  swipeIntent: DiscoveryActionName | null;
}) {
  return (
    <>
      <div className="relative aspect-[4/5] min-h-[440px] bg-[#d4fae8]">
        <CandidatePhoto candidate={candidate} priority={priority} />
        <div
          className={`absolute left-5 top-5 rounded-[14px] border-2 px-4 py-2 text-lg font-semibold uppercase tracking-[0.08em] transition-opacity ${
            swipeIntent === "PASS" ? "border-white bg-white/90 text-[#0d0d0d] opacity-100" : "border-white/60 text-white opacity-0"
          }`}
        >
          Pass
        </div>
        <div
          className={`absolute right-5 top-5 rounded-[14px] border-2 px-4 py-2 text-lg font-semibold uppercase tracking-[0.08em] transition-opacity ${
            swipeIntent === "LIKE"
              ? "border-[#18E299] bg-[#18E299]/90 text-[#0d0d0d] opacity-100"
              : "border-[#18E299]/60 text-[#18E299] opacity-0"
          }`}
        >
          Like
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white">
          <div className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
            {formatConnectionStatus(candidate.connectionStatus)}
          </div>
          <h2 className="mt-3 text-3xl font-semibold">
            {candidate.displayName}
            {candidate.age ? `, ${candidate.age}` : ""}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-sm font-medium">
            <MapPin className="size-4" aria-hidden="true" />
            {[candidate.city, candidate.state].filter(Boolean).join(", ") || "Nigeria"}
          </p>
        </div>
      </div>
      <div className="p-4">
        {candidate.bio ? <p className="text-sm leading-6 text-[#444444]">{candidate.bio}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.interests.slice(0, 5).map((interest) => (
            <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
              {interest}
            </span>
          ))}
        </div>
        <button
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onViewProfile}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={isActionDisabled}
        >
          <Eye className="size-4" aria-hidden="true" />
          View Profile
        </button>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-12 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onPass}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={isActionDisabled}
            aria-label="Pass"
            title="Pass"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <button
            className="inline-flex h-12 items-center justify-center rounded-full bg-[#18E299] text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onLike}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={isActionDisabled}
            aria-label="Like"
            title="Like"
          >
            <Heart className="size-5 fill-current" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#fafafa] px-3 text-xs font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onBlock}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={isActionDisabled}
          >
            <Ban className="size-4" aria-hidden="true" />
            Block
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#fafafa] px-3 text-xs font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onReport}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={isActionDisabled}
          >
            <Flag className="size-4" aria-hidden="true" />
            Report
          </button>
        </div>
      </div>
    </>
  );
}

function MemberProfileView({
  candidate,
  onBack,
  backLabel,
}: {
  candidate: DiscoveryCandidate;
  onBack: () => void;
  backLabel: string;
}) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const visiblePhotos = candidate.photos.slice(0, PROFILE_PHOTO_LIMIT);
  const safeActivePhotoIndex = activePhotoIndex < visiblePhotos.length ? activePhotoIndex : 0;
  const activePhoto = visiblePhotos[safeActivePhotoIndex] ?? visiblePhotos[0];
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ") || "Nigeria";

  return (
    <section>
      <div className="px-5 pt-5 md:px-8 md:pt-8">
        <button
          className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#0d0d0d]"
          onClick={onBack}
          aria-label={backLabel}
          title="Back"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ScreenHeader
        eyebrow="Profile"
        title={`${candidate.displayName}${candidate.age ? `, ${candidate.age}` : ""}`}
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className="mx-auto max-w-[560px]">
          <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <div className="relative aspect-[1.05] min-h-[320px] bg-[#d4fae8]">
              <ProfilePhotoImage
                photo={activePhoto}
                alt={`${candidate.displayName} profile photo`}
                variant="full"
                sizes="(max-width: 768px) 100vw, 560px"
                iconSize="lg"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
                <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                  {formatConnectionStatus(candidate.connectionStatus)}
                </span>
                <h2 className="mt-3 text-3xl font-semibold">
                  {candidate.displayName}
                  {candidate.age ? `, ${candidate.age}` : ""}
                </h2>
                <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                  <MapPin className="size-4" aria-hidden="true" />
                  {location}
                </p>
              </div>
            </div>

            {visiblePhotos.length > 1 ? (
              <div className="grid grid-cols-4 gap-2 p-3">
                {visiblePhotos.map((photo, index) => {
                  const isActive = index === safeActivePhotoIndex;

                  return (
                    <button
                      key={photo.id}
                      className={`relative aspect-square overflow-hidden rounded-[16px] border ${
                        isActive ? "border-[#18E299] ring-2 ring-[#18E299]/30" : "border-black/[0.06]"
                      }`}
                      type="button"
                      onClick={() => setActivePhotoIndex(index)}
                      aria-label={`Show ${candidate.displayName} photo ${index + 1}`}
                    >
                      <ProfilePhotoImage
                        photo={photo}
                        alt={`${candidate.displayName} thumbnail ${index + 1}`}
                        variant="thumb"
                        sizes="96px"
                        iconSize="sm"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="px-5 pb-5 pt-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Bio</p>
                <p className="mt-2 text-sm leading-6 text-[#444444]">{candidate.bio || "No bio added yet."}</p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Status</p>
                <p className="mt-2 text-sm font-medium text-[#444444]">
                  {formatConnectionStatus(candidate.connectionStatus)}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Location</p>
                <p className="mt-2 flex items-center gap-1 text-sm font-medium text-[#444444]">
                  <MapPin className="size-4 text-[#18E299]" aria-hidden="true" />
                  {location}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Interests</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidate.interests.length > 0 ? (
                    candidate.interests.slice(0, 10).map((interest) => (
                      <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
                        {interest}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#777777]">No interests added yet.</span>
                  )}
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function MatchesTab({
  token,
  user,
  onMatchesLoaded,
  onMatchOpened,
}: {
  token: string;
  user: StreetzUser;
  onMatchesLoaded: (matches: MatchThread[]) => void;
  onMatchOpened: (match: MatchThread) => void;
}) {
  const [matches, setMatches] = useState<MatchThread[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [viewedMatchProfile, setViewedMatchProfile] = useState<DiscoveryCandidate | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [matchSearch, setMatchSearch] = useState("");
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const selectedMatchIdRef = useRef<string | null>(selectedMatchId);
  const matchesRef = useRef<MatchThread[]>(matches);
  const onMatchesLoadedRef = useRef(onMatchesLoaded);
  const onMatchOpenedRef = useRef(onMatchOpened);

  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? null;
  const filteredMatches = useMemo(() => {
    const query = matchSearch.trim().toLowerCase();

    if (!query) {
      return matches;
    }

    return matches.filter((match) => {
      const haystack = [
        match.user.displayName,
        match.user.city,
        match.user.state,
        match.lastMessage?.body,
        ...match.user.interests,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [matches, matchSearch]);
  const matchActivityWeights = useMemo(() => {
    const weights = new Map<string, number>();

    for (const match of matches) {
      weights.set(match.id, getMatchActivityWeight(user.id, match));
    }

    return weights;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, user.id, activityVersion]);

  function getMatchPreview(match: MatchThread) {
    if (match.lastMessage) {
      const prefix = match.lastMessage.senderId === user.id ? "You: " : "";
      return `${prefix}${match.lastMessage.body}`;
    }

    return `Matched · ${match.user.city ?? "Nigeria"}`;
  }

  function openMatch(matchId: string) {
    const match = matches.find((candidate) => candidate.id === matchId);

    setNotice(null);
    setSelectedMatchId(matchId);
    setViewedMatchProfile(null);

    if (match) {
      onMatchOpened(match);
      setActivityVersion((current) => current + 1);
    }
  }

  function closeMatch() {
    setSelectedMatchId(null);
    setViewedMatchProfile(null);
    setMessages([]);
    setMessageBody("");
    setNotice(null);
  }

  async function loadMatches() {
    setIsLoadingMatches(true);
    setNotice(null);

    try {
      const response = await apiRequest<{ matches: MatchThread[] }>("/matches", {
        headers: authHeaders(token),
      });
      setMatches(response.matches);
      onMatchesLoaded(response.matches);
      setSelectedMatchId((current) => {
        if (current && response.matches.some((match) => match.id === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load matches.");
    } finally {
      setIsLoadingMatches(false);
    }
  }

  async function loadMessages(matchId: string) {
    setIsLoadingMessages(true);

    try {
      const response = await apiRequest<{ messages: DirectMessage[] }>(`/matches/${matchId}/messages`, {
        headers: authHeaders(token),
      });
      setMessages(response.messages);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load messages.");
    } finally {
      setIsLoadingMessages(false);
    }
  }

  function upsertMessage(message: DirectMessage) {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) {
        return current;
      }

      return [...current, message];
    });
    setMatches((current) =>
      current.map((match) => (match.id === message.matchId ? { ...match, lastMessage: message } : match))
    );
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMatches();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
    });
    const statusTimer = window.setTimeout(() => setSocketStatus("connecting"), 0);

    socketRef.current = socket;

    socket.on("connect", () => setSocketStatus("connected"));
    socket.on("disconnect", () => setSocketStatus("offline"));
    socket.on("connect_error", (error) => {
      setSocketStatus("offline");
      setNotice(error.message || "Unable to connect to live messaging.");
    });
    socket.on("direct-message:new", (message: DirectMessage) => {
      if (message.matchId === selectedMatchIdRef.current) {
        upsertMessage(message);
        const currentMatch = matchesRef.current.find((match) => match.id === message.matchId);

        if (currentMatch) {
          onMatchOpenedRef.current({ ...currentMatch, lastMessage: message });
          setActivityVersion((current) => current + 1);
        }
      } else {
        setMatches((current) => {
          const nextMatches = current.map((match) => (match.id === message.matchId ? { ...match, lastMessage: message } : match));
          onMatchesLoadedRef.current(nextMatches);
          return nextMatches;
        });
      }
    });

    return () => {
      window.clearTimeout(statusTimer);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    selectedMatchIdRef.current = selectedMatchId;
  }, [selectedMatchId]);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    onMatchesLoadedRef.current = onMatchesLoaded;
    onMatchOpenedRef.current = onMatchOpened;
  }, [onMatchesLoaded, onMatchOpened]);

  useEffect(() => {
    if (!selectedMatchId) {
      const timer = window.setTimeout(() => setMessages([]), 0);

      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void loadMessages(selectedMatchId);
      socketRef.current?.emit("match:join", { matchId: selectedMatchId });
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMatchId || !messageBody.trim()) {
      return;
    }

    const socket = socketRef.current;

    if (!socket?.connected) {
      setNotice("Live messaging is offline. Please wait for the socket to reconnect.");
      return;
    }

    setIsSendingMessage(true);
    setNotice(null);

    socket.emit(
      "direct-message:send",
      {
        matchId: selectedMatchId,
        body: messageBody,
      },
      (response: { ok?: boolean; message?: DirectMessage; error?: string }) => {
        setIsSendingMessage(false);

        if (!response?.ok || !response.message) {
          setNotice(response?.error ?? "Unable to send message.");
          return;
        }

        setMessageBody("");
        upsertMessage(response.message);
      }
    );
  }

  if (selectedMatch && viewedMatchProfile) {
    return (
      <MemberProfileView
        candidate={viewedMatchProfile}
        onBack={() => setViewedMatchProfile(null)}
        backLabel="Back to chat"
      />
    );
  }

  if (selectedMatch) {
    return (
      <section className="px-0 md:px-8 md:py-8">
        <article className="mx-auto flex min-h-[calc(100dvh-168px)] max-w-3xl flex-col overflow-hidden bg-white md:min-h-[720px] md:rounded-[28px] md:border md:border-black/[0.05] md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3">
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
              onClick={closeMatch}
              aria-label="Back to matches"
              title="Back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] p-1 text-left transition hover:bg-[#fafafa]"
              onClick={() => setViewedMatchProfile(selectedMatch.user)}
              aria-label={`View ${selectedMatch.user.displayName} profile`}
            >
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-[#d4fae8]">
                <CandidatePhoto candidate={selectedMatch.user} variant="thumb" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">{selectedMatch.user.displayName}</h1>
                <p className="truncate text-sm text-[#666666]">
                  {[selectedMatch.user.city, selectedMatch.user.state].filter(Boolean).join(", ") || "Nigeria"}
                </p>
              </div>
            </button>

            <div className="inline-flex items-center gap-2 rounded-full bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#666666]">
              <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
              {socketStatus === "connected" ? "Live" : "Connecting"}
            </div>
          </div>

          {notice ? <p className="mx-4 mt-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          <div className="flex-1 overflow-y-auto bg-[#fafafa] px-4 py-5">
            {isLoadingMessages ? (
              <div className="grid h-full min-h-[360px] place-items-center text-sm font-medium text-[#666666]">
                Loading messages
              </div>
            ) : messages.length > 0 ? (
              <div className="grid gap-3">
                {messages.map((message) => {
                  const isMine = message.senderId === user.id;

                  return (
                    <div key={message.id} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                      {!isMine ? (
                        <button
                          type="button"
                          className="relative size-7 shrink-0 overflow-hidden rounded-full bg-[#d4fae8]"
                          onClick={() => setViewedMatchProfile(selectedMatch.user)}
                          aria-label={`View ${selectedMatch.user.displayName} profile`}
                        >
                          <CandidatePhoto candidate={selectedMatch.user} variant="thumb" />
                        </button>
                      ) : null}
                      <div
                        className={`max-w-[78%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
                          isMine ? "rounded-br-md bg-[#18E299] text-[#0d0d0d]" : "rounded-bl-md bg-white text-[#0d0d0d]"
                        }`}
                      >
                        <p>{message.body}</p>
                        <p className={`mt-1 text-[11px] ${isMine ? "text-[#0d0d0d]/55" : "text-[#888888]"}`}>
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid h-full min-h-[360px] place-items-center text-center">
                <div>
                  <MessageCircle className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                  <h2 className="mt-3 text-2xl font-semibold">Start the chat</h2>
                  <p className="mt-2 text-sm text-[#666666]">Send the first message to {selectedMatch.user.displayName}.</p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="flex gap-3 border-t border-black/[0.05] bg-white p-4">
            <input
              className="h-12 min-w-0 flex-1 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              placeholder="Write a message"
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
            />
            <button
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[#18E299] text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSendingMessage || !messageBody.trim()}
              aria-label="Send message"
              title="Send"
            >
              {isSendingMessage ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SendHorizontal className="size-4" aria-hidden="true" />
              )}
            </button>
          </form>
        </article>
      </section>
    );
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Matches"
        title="Your conversations."
        action={
          <div className="hidden items-center gap-2 rounded-full border border-black/[0.08] px-4 py-2 text-sm font-medium md:inline-flex">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
            {socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        }
      />

      <div className="px-5 md:px-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingMatches ? (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05]">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading matches</p>
            </div>
          </div>
        ) : matches.length > 0 ? (
          <div className="mx-auto max-w-3xl">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-[#888888]" htmlFor="match-search">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#888888]" aria-hidden="true" />
              <input
                id="match-search"
                className="h-12 w-full rounded-full border border-black/[0.08] pl-11 pr-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Search name, city, interest"
                value={matchSearch}
                onChange={(event) => setMatchSearch(event.target.value)}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              {filteredMatches.length > 0 ? (
                filteredMatches.map((match) => {
                  const activityWeight = matchActivityWeights.get(match.id) ?? 0;

                  return (
                    <button
                      key={match.id}
                      className="flex w-full items-center gap-4 border-b border-black/[0.05] px-4 py-4 text-left transition last:border-b-0 hover:bg-[#fafafa]"
                      onClick={() => openMatch(match.id)}
                    >
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-[#d4fae8] sm:size-20">
                        <CandidatePhoto candidate={match.user} variant="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-lg font-semibold">{match.user.displayName}</p>
                          {activityWeight > 0 ? (
                            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[#18E299] px-1 text-[10px] font-semibold leading-5 text-[#0d0d0d]">
                              {activityWeight > 9 ? "9+" : activityWeight}
                            </span>
                          ) : (
                            <p className="shrink-0 text-xs font-medium text-[#999999]">
                              {new Date(match.lastMessage?.createdAt ?? match.createdAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-[#666666]">{getMatchPreview(match)}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="grid min-h-[260px] place-items-center p-6 text-center">
                  <div>
                    <Search className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                    <h2 className="mt-3 text-2xl font-semibold">No matches found</h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">Try another name, city, or interest.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05] p-6 text-center">
            <div>
              <MessagesSquare className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No matches yet</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">
                When someone likes you back, they will appear here.
              </p>
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/[0.08] px-5 text-sm font-medium"
                onClick={loadMatches}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CandidatePhoto({
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

function RoomsTab() {
  return (
    <section>
      <ScreenHeader
        eyebrow="Rooms"
        title="Public rooms, curated by admin."
        action={
          <button className="hidden h-10 items-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white md:inline-flex">
            <MessageCircle className="size-4" aria-hidden="true" />
            New
          </button>
        }
      />

      <div className="grid gap-3 px-5 md:px-8">
        {rooms.map((room) => (
          <article key={room.name} className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">{room.name}</h2>
                  <span className="rounded-full bg-[#d4fae8] px-2.5 py-1 text-xs font-medium text-[#0fa76e]">
                    {room.live}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#666666]">{room.lastMessage}</p>
              </div>
              <button className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08]">
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {room.city}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1">
                <Users className="size-3.5" aria-hidden="true" />
                {room.members}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EventsTab() {
  return (
    <section>
      <ScreenHeader
        eyebrow="Events"
        title="Tickets for what is next."
        action={
          <button className="hidden h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium md:inline-flex">
            <CalendarDays className="size-4" aria-hidden="true" />
            Calendar
          </button>
        }
      />

      <div className="grid gap-4 px-5 md:grid-cols-2 md:px-8 xl:grid-cols-3">
        {events.map((event) => (
          <article key={event.title} className="overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="relative aspect-[16/11]">
              <Image src={event.image} alt={`${event.title} event`} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                {event.price}
              </span>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{event.date} · {event.time}</p>
              <h2 className="mt-2 text-lg font-semibold">{event.title}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-[#666666]">
                <MapPin className="size-4" aria-hidden="true" />
                {event.city}
              </p>
              <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white">
                Buy ticket
                <Ticket className="size-4" aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
