"use client";

import type { CSSProperties, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus, Gender, Sexuality } from "@/lib/types";
import { Ban, Eye, Flag, Heart, LoaderCircle, MapPin, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import {
  DISCOVERY_DECK_SIZE,
  DISCOVERY_EXIT_TRANSITION_MS,
  DISCOVERY_REFILL_THRESHOLD,
  DISCOVERY_RENDERED_STACK_SIZE,
  DISCOVERY_SWIPE_DISTANCE,
  DISCOVERY_SWIPE_FLICK_DISTANCE,
  DISCOVERY_SWIPE_FLICK_VELOCITY,
  mergeCandidateDeck,
  preconnectCandidatePhotoOrigins,
} from "@/lib/discovery";
import {
  DEFAULT_DISCOVERY_DISTANCE_KM,
  DISCOVERY_DISTANCE_STEP_KM,
  MAX_DISCOVERY_DISTANCE_KM,
  MIN_DISCOVERY_DISTANCE_KM,
  type ReverseGeocodeSuggestion,
  formatDistanceKm,
  getCurrentBrowserCoordinates,
  getLocationPermissionMessage,
} from "@/lib/location";
import { getCandidatePhotoUrl } from "@/lib/media";
import { normalizeLocationSuggestion } from "@/lib/nigeria-locations";
import { connectionStatusOptions, formatConnectionStatus, formatSexuality, sexualityOptions } from "@/lib/profile";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASON_OPTIONS } from "@/lib/report-reasons";
import type { DiscoveryActionName, DiscoveryCandidate, StreetzProfile } from "@/lib/types";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { MemberProfileView } from "@/features/discovery/member-profile-view";

type DiscoveryLocationMeta = {
  hasCoordinates: boolean;
  city: string | null;
  state: string | null;
  maxDistanceKm: number;
  locationUpdatedAt: string | null;
};

type DiscoveryResponse = {
  candidates: DiscoveryCandidate[];
  location?: DiscoveryLocationMeta;
};

const defaultDiscoveryLocation: DiscoveryLocationMeta = {
  hasCoordinates: false,
  city: null,
  state: null,
  maxDistanceKm: DEFAULT_DISCOVERY_DISTANCE_KM,
  locationUpdatedAt: null,
};

const LOCATION_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type DiscoveryFilters = {
  minAge: number | null;
  maxAge: number | null;
  gender: Gender[];
  sexuality: Sexuality[];
  lookingFor: ConnectionStatus[];
};

const defaultDiscoveryFilters: DiscoveryFilters = {
  minAge: null,
  maxAge: null,
  gender: [],
  sexuality: [],
  lookingFor: [],
};

type PendingDisplayLocation = {
  city: string;
  state: string;
};

export function DiscoveryTab({ token, onMatchCreated }: { token: string; onMatchCreated: () => void }) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [viewedCandidate, setViewedCandidate] = useState<DiscoveryCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefilling, setIsRefilling] = useState(false);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [matchNotice, setMatchNotice] = useState<{ name: string } | null>(null);
  const [matchNoticePhase, setMatchNoticePhase] = useState<"entering" | "leaving">("entering");
  const [blockTarget, setBlockTarget] = useState<DiscoveryCandidate | null>(null);
  const [reportTarget, setReportTarget] = useState<DiscoveryCandidate | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [locationMeta, setLocationMeta] = useState<DiscoveryLocationMeta>(defaultDiscoveryLocation);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [draftMaxDistanceKm, setDraftMaxDistanceKm] = useState(DEFAULT_DISCOVERY_DISTANCE_KM);
  const [activeFilters, setActiveFilters] = useState<DiscoveryFilters>(defaultDiscoveryFilters);
  const [draftFilters, setDraftFilters] = useState<DiscoveryFilters>(defaultDiscoveryFilters);
  const activeFiltersRef = useRef<DiscoveryFilters>(defaultDiscoveryFilters);
  const [isSavingFilters, setIsSavingFilters] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [pendingDisplayLocation, setPendingDisplayLocation] = useState<PendingDisplayLocation | null>(null);
  const [isSavingDisplayLocation, setIsSavingDisplayLocation] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number; candidateId: string; startedAt: number } | null>(null);
  const swipeLatestOffsetRef = useRef({ x: 0, y: 0 });
  const dismissedCandidateIdsRef = useRef<Set<string>>(new Set());
  const refillRequestRef = useRef(false);
  const removalTimersRef = useRef<number[]>([]);
  const matchNoticeTimerRef = useRef<number | null>(null);
  const matchLeaveTimerRef = useRef<number | null>(null);

  const activeCandidate = candidates[0];
  const isActingOnActiveCandidate = activeCandidate ? actionTargetId === activeCandidate.id : false;
  const activeFilterCount = [
    activeFilters.minAge !== null || activeFilters.maxAge !== null ? 1 : 0,
    activeFilters.gender.length > 0 ? 1 : 0,
    activeFilters.sexuality.length > 0 ? 1 : 0,
    activeFilters.lookingFor.length > 0 ? 1 : 0,
  ].reduce((sum, n) => sum + n, 0);
  const swipeIntent = dragOffset.x > 60 ? "LIKE" : dragOffset.x < -60 ? "PASS" : null;
  const renderedCandidates = candidates.slice(0, DISCOVERY_RENDERED_STACK_SIZE);
  const swipeCardStyle: CSSProperties = {
    transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${dragOffset.x / 18}deg)`,
    transition: isDraggingCard ? "none" : "transform 180ms ease",
  };
  const isNoLimitDistance = locationMeta.maxDistanceKm === 0;
  const shouldPromptForLocation = shouldRefreshDiscoveryLocation(locationMeta);
  const locationPromptText = !locationMeta.hasCoordinates
    ? "Update your location to see nearby people."
    : "Refresh your location to keep nearby profiles accurate.";

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
      const params = new URLSearchParams();
      const filters = activeFiltersRef.current;
      if (filters.minAge !== null) params.append("minAge", String(filters.minAge));
      if (filters.maxAge !== null) params.append("maxAge", String(filters.maxAge));
      for (const g of filters.gender) params.append("gender", g);
      for (const s of filters.sexuality) params.append("sexuality", s);
      for (const l of filters.lookingFor) params.append("lookingFor", l);
      const qs = params.toString();
      const candidatesResponse = await apiRequest<DiscoveryResponse>(`/discovery/candidates${qs ? `?${qs}` : ""}`, {
        headers: authHeaders(token),
      });
      const nextLocationMeta = candidatesResponse.location ?? defaultDiscoveryLocation;
      const availableCandidates = candidatesResponse.candidates.filter(
        (candidate) => !dismissedCandidateIdsRef.current.has(candidate.id)
      );

      setLocationMeta(nextLocationMeta);
      setDraftMaxDistanceKm(nextLocationMeta.maxDistanceKm);
      preconnectCandidatePhotoOrigins(availableCandidates.slice(0, DISCOVERY_RENDERED_STACK_SIZE));

      setCandidates((current) =>
        mode === "append"
          ? mergeCandidateDeck(current, availableCandidates, dismissedCandidateIdsRef.current)
          : availableCandidates.slice(0, DISCOVERY_DECK_SIZE)
      );
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      if (showLoading) {
        setIsLoading(false);
      } else {
        refillRequestRef.current = false;
        setIsRefilling(false);
      }
    }
  }

  function syncLocationMetaFromProfile(profile: StreetzProfile) {
    const nextLocationMeta = {
      hasCoordinates: profile.latitude !== null && profile.longitude !== null,
      city: profile.city,
      state: profile.state,
      maxDistanceKm: profile.maxDistanceKm ?? DEFAULT_DISCOVERY_DISTANCE_KM,
      locationUpdatedAt: profile.locationUpdatedAt,
    };

    setLocationMeta(nextLocationMeta);
    setDraftMaxDistanceKm(nextLocationMeta.maxDistanceKm);
  }

  async function saveFilters() {
    setIsSavingFilters(true);
    setNotice(null);

    try {
      if (draftMaxDistanceKm !== locationMeta.maxDistanceKm) {
        const savedProfile = await apiRequest<StreetzProfile>("/profiles/me", {
          method: "PUT",
          headers: authHeaders(token),
          body: JSON.stringify({ maxDistanceKm: draftMaxDistanceKm }),
        });
        syncLocationMetaFromProfile(savedProfile);
      }

      activeFiltersRef.current = draftFilters;
      setActiveFilters(draftFilters);
      setIsFilterOpen(false);
      void loadDiscovery({ clearNotice: false });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSavingFilters(false);
    }
  }

  async function saveCurrentLocation() {
    setIsDetectingLocation(true);
    setNotice(null);

    try {
      const coordinates = await getCurrentBrowserCoordinates();
      const suggestion = await reverseGeocodeCoordinates(coordinates).catch(() => null);
      const suggestedDisplayLocation = suggestion ? getDisplayLocationSuggestion(suggestion, locationMeta) : null;
      const savedProfile = await apiRequest<StreetzProfile>("/profiles/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          locationAccuracyMeters: coordinates.accuracy ?? undefined,
          maxDistanceKm: draftMaxDistanceKm,
        }),
      });

      syncLocationMetaFromProfile(savedProfile);
      if (suggestedDisplayLocation) {
        setPendingDisplayLocation(suggestedDisplayLocation);
        setIsFilterOpen(false);
        setNotice("Location updated for distance.");
      } else {
        setNotice("Location updated for nearby profiles.");
      }
      void loadDiscovery({ clearNotice: false });
    } catch (error) {
      setNotice(getLocationPermissionMessage(error));
    } finally {
      setIsDetectingLocation(false);
    }
  }

  async function updateDisplayLocation() {
    if (!pendingDisplayLocation) {
      return;
    }

    setIsSavingDisplayLocation(true);
    setNotice(null);

    try {
      const savedProfile = await apiRequest<StreetzProfile>("/profiles/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({
          city: pendingDisplayLocation.city,
          state: pendingDisplayLocation.state,
        }),
      });

      syncLocationMetaFromProfile(savedProfile);
      setPendingDisplayLocation(null);
      setNotice(`Display location updated to ${pendingDisplayLocation.city}, ${pendingDisplayLocation.state}.`);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSavingDisplayLocation(false);
    }
  }

  async function reverseGeocodeCoordinates(coordinates: { latitude: number; longitude: number }) {
    return apiRequest<ReverseGeocodeSuggestion>("/profiles/location/reverse-geocode", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }),
    });
  }

  useEffect(() => {
    activeFiltersRef.current = activeFilters;
  }, [activeFilters]);

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
      if (matchNoticeTimerRef.current) {
        window.clearTimeout(matchNoticeTimerRef.current);
      }
      if (matchLeaveTimerRef.current) {
        window.clearTimeout(matchLeaveTimerRef.current);
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

  function showMatchNotice(candidate: DiscoveryCandidate) {
    if (matchNoticeTimerRef.current) {
      window.clearTimeout(matchNoticeTimerRef.current);
    }
    if (matchLeaveTimerRef.current) {
      window.clearTimeout(matchLeaveTimerRef.current);
    }

    setMatchNotice({ name: candidate.displayName });
    setMatchNoticePhase("entering");
    matchNoticeTimerRef.current = window.setTimeout(() => {
      setMatchNoticePhase("leaving");
      matchNoticeTimerRef.current = null;
      matchLeaveTimerRef.current = window.setTimeout(() => {
        setMatchNotice(null);
        matchLeaveTimerRef.current = null;
      }, 350);
    }, 1650);
  }

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
        showMatchNotice(candidate);
        onMatchCreated();
      }
    } catch (error) {
      dismissedCandidateIdsRef.current.delete(candidate.id);
      setNotice(getUserErrorMessage(error));
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

  async function confirmBlockCandidate() {
    if (!blockTarget) {
      return;
    }

    setActionTargetId(blockTarget.id);

    try {
      await apiRequest("/discovery/block", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ targetUserId: blockTarget.id }),
      });
      setCandidates((current) => current.filter((candidate) => candidate.id !== blockTarget.id));
      setBlockTarget(null);
      setNotice("Profile blocked.");
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setActionTargetId(null);
    }
  }

  async function submitReportCandidate() {
    const reason = reportReason.trim();
    const details = reportDetails.trim();

    if (!reportTarget) {
      return;
    }

    if (!REPORT_REASON_OPTIONS.includes(reason as (typeof REPORT_REASON_OPTIONS)[number])) {
      setReportError("Choose a report reason.");
      return;
    }

    if (details.length > REPORT_DETAILS_MAX_LENGTH) {
      setReportError(`Details must be ${REPORT_DETAILS_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setReportError(null);
    setActionTargetId(reportTarget.id);

    try {
      await apiRequest("/discovery/report", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          targetUserId: reportTarget.id,
          reason,
          ...(details ? { details } : {}),
        }),
      });
      setReportTarget(null);
      setReportReason("");
      setReportDetails("");
      setReportError(null);
      setNotice("Report sent.");
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setActionTargetId(null);
    }
  }

  if (viewedCandidate) {
    return (
      <MemberProfileView
        candidate={viewedCandidate}
        onBack={() => setViewedCandidate(null)}
        backLabel="Back to discovery"
        token={token}
        showSafetyActions
        onBlocked={(candidate) => {
          setCandidates((current) => current.filter((currentCandidate) => currentCandidate.id !== candidate.id));
          dismissedCandidateIdsRef.current.add(candidate.id);
          setViewedCandidate(null);
          setNotice("Profile blocked.");
        }}
      />
    );
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Discovery"
        title=""
        action={
          <button
            className="relative inline-flex h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium"
            type="button"
            onClick={() => {
              setDraftMaxDistanceKm(locationMeta.maxDistanceKm);
              setDraftFilters(activeFilters);
              setIsFilterOpen(true);
            }}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-1 grid min-w-5 place-items-center rounded-full bg-[#18E299] px-1 text-[10px] font-semibold leading-5 text-[#0d0d0d]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        }
      />

      {matchNotice ? (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+16px)] z-50 mx-auto max-w-sm rounded-[24px] border border-white/10 bg-[#0d0d0d] px-5 py-4 text-white shadow-[0_18px_60px_rgba(0,0,0,0.24)] ${matchNoticePhase === "leaving" ? "match-notice-leaving" : "match-notice-entering"}`}
        >
          <p className="text-sm font-semibold">Match with {matchNotice.name}.</p>
          <p className="mt-1 text-xs leading-5 text-white/70">Go to the Matches tab to get in touch.</p>
        </div>
      ) : null}

      <div className="px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {!isLoading && shouldPromptForLocation ? (
          <div className="mb-4 rounded-[20px] border border-black/[0.06] bg-[#fafafa] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0d0d0d]">Nearby discovery</p>
                <p className="mt-1 text-sm leading-5 text-[#666666]">{locationPromptText}</p>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void saveCurrentLocation()}
                disabled={isDetectingLocation}
              >
                {isDetectingLocation ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
                Update
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(360px,520px)_1fr]">
          {isLoading ? (
            <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)] xl:max-w-[520px]">
              <LoadingState label="Loading discovery" className="min-h-[520px] p-6" />
            </article>
          ) : renderedCandidates.length > 0 ? (
            <div className="relative xl:max-w-[520px]">
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
                    className={`${isTopCard ? "relative" : "absolute inset-x-0 top-0"} overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${isTopCard ? "touch-pan-y select-none" : "pointer-events-none"
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
                      onBlock={() => {
                        setNotice(null);
                        setBlockTarget(candidate);
                      }}
                      onLike={() => recordDiscoveryAction(candidate, "LIKE")}
                      onPass={() => recordDiscoveryAction(candidate, "PASS")}
                      onReport={() => {
                        setNotice(null);
                        setReportReason("");
                        setReportDetails("");
                        setReportError(null);
                        setReportTarget(candidate);
                      }}
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

      {blockTarget ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                <Ban className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0d0d0d]">Block this profile?</h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  You will stop seeing {blockTarget.displayName} in discovery.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setBlockTarget(null)}
                disabled={actionTargetId === blockTarget.id}
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={confirmBlockCandidate}
                disabled={actionTargetId === blockTarget.id}
              >
                {actionTargetId === blockTarget.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Block
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportTarget ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <form
            className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
            onSubmit={(event) => {
              event.preventDefault();
              void submitReportCandidate();
            }}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d4fae8] text-[#0fa76e]">
                <Flag className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0d0d0d]">Report profile</h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  Tell us what is wrong with this profile from {reportTarget.displayName}.
                </p>
              </div>
            </div>
            <select
              className="mt-4 h-11 w-full rounded-full border border-black/[0.08] bg-white px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              value={reportReason}
              onChange={(event) => {
                setReportReason(event.target.value);
                setReportError(null);
              }}
              required
              disabled={actionTargetId === reportTarget.id}
            >
              <option value="">Choose a violation</option>
              {REPORT_REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <textarea
              className="mt-3 min-h-24 w-full resize-none rounded-[20px] border border-black/[0.08] p-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              placeholder="Optional details"
              value={reportDetails}
              onChange={(event) => {
                setReportDetails(event.target.value);
                setReportError(null);
              }}
              maxLength={REPORT_DETAILS_MAX_LENGTH}
              disabled={actionTargetId === reportTarget.id}
            />
            {reportError ? <p className="mt-2 text-xs font-medium text-red-600">{reportError}</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => {
                  setReportTarget(null);
                  setReportReason("");
                  setReportDetails("");
                  setReportError(null);
                }}
                disabled={actionTargetId === reportTarget.id}
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={actionTargetId === reportTarget.id || !reportReason}
              >
                {actionTargetId === reportTarget.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Send report
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isFilterOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/35 px-5 backdrop-blur-sm" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "max(24px, env(safe-area-inset-top))", paddingBottom: 24 }}>
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0d0d0d]">Discovery filters</h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  {!locationMeta.hasCoordinates ? "GPS is off, so distances stay hidden." : isNoLimitDistance ? "Showing profiles from anywhere." : "Using GPS for nearby profiles."}
                </p>
              </div>
              <button
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
                type="button"
                onClick={() => setIsFilterOpen(false)}
                aria-label="Close filters"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            {/* Distance */}
            <div className="mt-5 rounded-[20px] border border-black/[0.06] bg-[#fafafa] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-[#0d0d0d]">Maximum distance</span>
                <div className="flex items-center gap-2">
                  {draftMaxDistanceKm > 0 ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0d0d0d]">
                      {draftMaxDistanceKm} km
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${draftMaxDistanceKm === 0 ? "bg-[#0d0d0d] text-white" : "bg-white text-[#666666]"}`}
                    onClick={() =>
                      setDraftMaxDistanceKm(draftMaxDistanceKm === 0 ? DEFAULT_DISCOVERY_DISTANCE_KM : 0)
                    }
                  >
                    No limit
                  </button>
                </div>
              </div>
              <input
                className="mt-4 w-full accent-[#18E299] disabled:opacity-40"
                type="range"
                min={MIN_DISCOVERY_DISTANCE_KM}
                max={MAX_DISCOVERY_DISTANCE_KM}
                step={DISCOVERY_DISTANCE_STEP_KM}
                value={draftMaxDistanceKm === 0 ? MAX_DISCOVERY_DISTANCE_KM : draftMaxDistanceKm}
                onChange={(event) => setDraftMaxDistanceKm(Number(event.target.value))}
                disabled={draftMaxDistanceKm === 0}
              />
            </div>

            <button
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => void saveCurrentLocation()}
              disabled={isDetectingLocation || isSavingFilters}
            >
              {isDetectingLocation ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
              {locationMeta.hasCoordinates ? "Update GPS location" : "Use GPS location"}
            </button>

            {/* Age range */}
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Age range</p>
              <div className="mt-2 flex items-center gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-[#666666]">Min</span>
                  <input
                    className="h-11 w-full rounded-full border border-black/[0.08] px-4 text-sm text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    type="number"
                    min={18}
                    max={100}
                    placeholder="18"
                    value={draftFilters.minAge ?? ""}
                    onChange={(event) => {
                      const val = event.target.value === "" ? null : Math.max(18, Math.min(100, Number(event.target.value)));
                      setDraftFilters((f) => ({ ...f, minAge: val }));
                    }}
                  />
                </label>
                <span className="mt-5 text-sm text-[#888888]">–</span>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-[#666666]">Max</span>
                  <input
                    className="h-11 w-full rounded-full border border-black/[0.08] px-4 text-sm text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    type="number"
                    min={18}
                    max={100}
                    placeholder="100"
                    value={draftFilters.maxAge ?? ""}
                    onChange={(event) => {
                      const val = event.target.value === "" ? null : Math.max(18, Math.min(100, Number(event.target.value)));
                      setDraftFilters((f) => ({ ...f, maxAge: val }));
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Looking for */}
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Looking for</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {connectionStatusOptions.map((option) => {
                  const active = draftFilters.lookingFor.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition ${active ? "border-[#0d0d0d] bg-[#0d0d0d] text-white" : "border-black/[0.08] text-[#444444]"}`}
                      onClick={() =>
                        setDraftFilters((f) => ({
                          ...f,
                          lookingFor: active ? f.lookingFor.filter((v) => v !== option.value) : [...f.lookingFor, option.value],
                        }))
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gender */}
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Gender</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["WOMAN", "MAN", "NON_BINARY", "PREFER_NOT_TO_SAY"] as Gender[]).map((value) => {
                  const label = value === "WOMAN" ? "Female" : value === "MAN" ? "Male" : value === "NON_BINARY" ? "Non-binary" : "Prefer not to say";
                  const active = draftFilters.gender.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition ${active ? "border-[#0d0d0d] bg-[#0d0d0d] text-white" : "border-black/[0.08] text-[#444444]"}`}
                      onClick={() =>
                        setDraftFilters((f) => ({
                          ...f,
                          gender: active ? f.gender.filter((v) => v !== value) : [...f.gender, value],
                        }))
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sexuality */}
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Sexuality</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sexualityOptions.filter((o) => o.value !== "PREFER_NOT_TO_SAY").map((option) => {
                  const active = draftFilters.sexuality.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition ${active ? "border-[#0d0d0d] bg-[#0d0d0d] text-white" : "border-black/[0.08] text-[#444444]"}`}
                      onClick={() =>
                        setDraftFilters((f) => ({
                          ...f,
                          sexuality: active ? f.sexuality.filter((v) => v !== option.value) : [...f.sexuality, option.value],
                        }))
                      }
                    >
                      {formatSexuality(option.value)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setIsFilterOpen(false)}
                disabled={isSavingFilters || isDetectingLocation}
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void saveFilters()}
                disabled={isSavingFilters || isDetectingLocation}
              >
                {isSavingFilters ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDisplayLocation ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d4fae8] text-[#0fa76e]">
                <MapPin className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0d0d0d]">Update display location?</h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  You seem to be in {pendingDisplayLocation.city}, {pendingDisplayLocation.state}.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setPendingDisplayLocation(null)}
                disabled={isSavingDisplayLocation}
              >
                Keep current
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void updateDisplayLocation()}
                disabled={isSavingDisplayLocation}
              >
                {isSavingDisplayLocation ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Update
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function shouldRefreshDiscoveryLocation(location: DiscoveryLocationMeta) {
  if (!location.hasCoordinates || !location.locationUpdatedAt) {
    return true;
  }

  const updatedAt = new Date(location.locationUpdatedAt).getTime();

  if (Number.isNaN(updatedAt)) {
    return true;
  }

  return Date.now() - updatedAt > LOCATION_STALE_AFTER_MS;
}

function getDisplayLocationSuggestion(
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
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ") || "Nigeria";
  const distance = formatDistanceKm(candidate.distanceKm);
  const locationLabel = distance ? `${location} · ${distance}` : location;

  return (
    <>
      <div className="relative h-[clamp(320px,44svh,440px)] bg-[#d4fae8] md:aspect-[4/5] md:h-auto md:min-h-[440px]">
        <CandidatePhoto candidate={candidate} priority={priority} />
        <div
          className={`absolute left-5 top-5 rounded-[14px] border-2 px-4 py-2 text-lg font-semibold uppercase tracking-[0.08em] transition-opacity ${swipeIntent === "PASS" ? "border-white bg-white/90 text-[#0d0d0d] opacity-100" : "border-white/60 text-white opacity-0"
            }`}
        >
          Pass
        </div>
        <div
          className={`absolute right-5 top-5 rounded-[14px] border-2 px-4 py-2 text-lg font-semibold uppercase tracking-[0.08em] transition-opacity ${swipeIntent === "LIKE"
            ? "border-[#18E299] bg-[#18E299]/90 text-[#0d0d0d] opacity-100"
            : "border-[#18E299]/60 text-[#18E299] opacity-0"
            }`}
        >
          Like
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 text-white md:p-5">
          <div className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
            {formatConnectionStatus(candidate.connectionStatus)}
          </div>
          <h2 className="mt-2 text-2xl font-semibold md:mt-3 md:text-3xl">
            {candidate.displayName}
            {candidate.age ? `, ${candidate.age}` : ""}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-sm font-medium">
            <MapPin className="size-4" aria-hidden="true" />
            {locationLabel}
          </p>
        </div>
      </div>
      <div className="p-4">
        {candidate.bio ? <p className="line-clamp-2 text-sm leading-6 text-[#444444]">{candidate.bio}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.interests.slice(0, 4).map((interest) => (
            <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
              {interest}
            </span>
          ))}
        </div>
        <button
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onViewProfile}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={isActionDisabled}
        >
          <Eye className="size-4" aria-hidden="true" />
          View Profile
        </button>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onPass}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={isActionDisabled}
            aria-label="Pass"
            title="Pass"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <button
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#18E299] text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onLike}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={isActionDisabled}
            aria-label="Like"
            title="Like"
          >
            <Heart className="size-5 fill-current" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#fafafa] px-3 text-xs font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onBlock}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={isActionDisabled}
          >
            <Ban className="size-4" aria-hidden="true" />
            Block
          </button>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#fafafa] px-3 text-xs font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
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
