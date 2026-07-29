"use client";

import type { CSSProperties, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Heart, LoaderCircle, MapPin, RefreshCw, SlidersHorizontal } from "lucide-react";
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
  type ReverseGeocodeSuggestion,
  getCurrentBrowserCoordinates,
  getLocationPermissionMessage,
} from "@/lib/location";
import { getCandidatePhotoUrl } from "@/lib/media";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASON_OPTIONS } from "@/lib/report-reasons";
import type { DiscoveryActionName, DiscoveryCandidate, DiscoveryPreference, StreetzProfile } from "@/lib/types";
import { MemberProfileView } from "@/features/discovery/member-profile-view";
import { DiscoveryPreferencesForm } from "@/features/discovery/discovery-preferences-form";
import {
  defaultDiscoveryLocation,
  getDefaultDiscoveryFilters,
  getDisplayLocationSuggestion,
  shouldRefreshDiscoveryLocation,
  type DiscoveryFilters,
  type DiscoveryLocationMeta,
  type DiscoveryResponse,
  type PendingDisplayLocation,
} from "./discovery-model";
import { DiscoveryCandidateCard } from "./discovery-candidate-card";
import { DiscoveryFiltersDialog } from "./discovery-filters-dialog";
import { BlockCandidateDialog, ReportCandidateDialog } from "./discovery-safety-dialogs";
import { DisplayLocationDialog } from "./display-location-dialog";

export function DiscoveryTab({
  token,
  onMatchCreated,
}: {
  token: string;
  onMatchCreated: () => void;
}) {
  const initialFilters = getDefaultDiscoveryFilters();
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
  const [isPreferenceOpen, setIsPreferenceOpen] = useState(false);
  const [preferenceRequired, setPreferenceRequired] = useState(false);
  const [discoveryPreference, setDiscoveryPreference] = useState<DiscoveryPreference | null>(null);
  const [draftMaxDistanceKm, setDraftMaxDistanceKm] = useState(DEFAULT_DISCOVERY_DISTANCE_KM);
  const [activeFilters, setActiveFilters] = useState<DiscoveryFilters>(() => initialFilters);
  const [draftFilters, setDraftFilters] = useState<DiscoveryFilters>(() => initialFilters);
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
  const swipeIntent = dragOffset.x > 60 ? "LIKE" : dragOffset.x < -60 ? "PASS" : null;
  const renderedCandidates = candidates.slice(0, DISCOVERY_RENDERED_STACK_SIZE);
  const swipeCardStyle: CSSProperties = {
    transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${dragOffset.x / 18}deg)`,
    transition: isDraggingCard ? "none" : "transform 180ms ease",
  };
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
      const candidatesResponse = await apiRequest<DiscoveryResponse>("/discovery/candidates", {
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

      if (
        discoveryPreference &&
        draftFilters.minAge !== null &&
        draftFilters.maxAge !== null &&
        (draftFilters.minAge !== discoveryPreference.minAge || draftFilters.maxAge !== discoveryPreference.maxAge)
      ) {
        const savedPreference = await apiRequest<DiscoveryPreference>("/profiles/me/discovery-preferences", {
          method: "PUT",
          headers: authHeaders(token),
          body: JSON.stringify({
            discoveryGender: discoveryPreference.discoveryGender,
            showGender: discoveryPreference.showGender,
            interestedInGenders: discoveryPreference.interestedInGenders,
            minAge: draftFilters.minAge,
            maxAge: draftFilters.maxAge,
          }),
        });
        setDiscoveryPreference(savedPreference);
      }

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
    let cancelled = false;
    dismissedCandidateIdsRef.current = new Set();
    void apiRequest<DiscoveryPreference>("/profiles/me/discovery-preferences", { headers: authHeaders(token) })
      .then((preference) => {
        if (cancelled) return;
        setDiscoveryPreference(preference);
        const filters = { minAge: preference.minAge, maxAge: preference.maxAge };
        setActiveFilters(filters);
        setDraftFilters(filters);
        if (preference.needsConfirmation) {
          setPreferenceRequired(true);
          setIsPreferenceOpen(true);
          setIsLoading(false);
        } else {
          void loadDiscovery();
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(getUserErrorMessage(error));
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
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
        {notice ? <p className="mb-4 rounded-[16px] bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

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
                  <Heart className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
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
        <BlockCandidateDialog
          candidate={blockTarget}
          isSubmitting={actionTargetId === blockTarget.id}
          onCancel={() => setBlockTarget(null)}
          onConfirm={() => void confirmBlockCandidate()}
        />
      ) : null}

      {reportTarget ? (
        <ReportCandidateDialog
          candidate={reportTarget}
          details={reportDetails}
          error={reportError}
          isSubmitting={actionTargetId === reportTarget.id}
          reason={reportReason}
          onCancel={() => {
            setReportTarget(null);
            setReportReason("");
            setReportDetails("");
            setReportError(null);
          }}
          onDetailsChange={(details) => {
            setReportDetails(details);
            setReportError(null);
          }}
          onReasonChange={(reason) => {
            setReportReason(reason);
            setReportError(null);
          }}
          onSubmit={() => void submitReportCandidate()}
        />
      ) : null}

      {isFilterOpen ? (
        <DiscoveryFiltersDialog
          draftFilters={draftFilters}
          draftMaxDistanceKm={draftMaxDistanceKm}
          isDetectingLocation={isDetectingLocation}
          isSaving={isSavingFilters}
          location={locationMeta}
          onApply={() => void saveFilters()}
          onCancel={() => setIsFilterOpen(false)}
          onChangeFilters={setDraftFilters}
          onChangeMaxDistance={setDraftMaxDistanceKm}
          onChangePreferences={() => {
            setIsFilterOpen(false);
            setIsPreferenceOpen(true);
          }}
          onUpdateLocation={() => void saveCurrentLocation()}
        />
      ) : null}

      {isPreferenceOpen ? (
        <DiscoveryPreferencesForm
          token={token}
          required={preferenceRequired}
          onClose={() => setIsPreferenceOpen(false)}
          onSaved={(preference) => {
            setDiscoveryPreference(preference);
            setPreferenceRequired(false);
            setIsPreferenceOpen(false);
            const filters = { minAge: preference.minAge, maxAge: preference.maxAge };
            setActiveFilters(filters);
            setDraftFilters(filters);
            dismissedCandidateIdsRef.current = new Set();
            void loadDiscovery();
          }}
        />
      ) : null}

      {pendingDisplayLocation ? (
        <DisplayLocationDialog
          isSaving={isSavingDisplayLocation}
          location={pendingDisplayLocation}
          onCancel={() => setPendingDisplayLocation(null)}
          onConfirm={() => void updateDisplayLocation()}
        />
      ) : null}
    </section>
  );
}
