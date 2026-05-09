"use client";

import type { CSSProperties, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Ban, Eye, Flag, Heart, LoaderCircle, MapPin, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { apiRequest, authHeaders } from "@/lib/api";
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
import { getCandidatePhotoUrl } from "@/lib/media";
import { formatConnectionStatus } from "@/lib/profile";
import type { DiscoveryActionName, DiscoveryCandidate } from "@/lib/types";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { MemberProfileView } from "@/features/discovery/member-profile-view";

export function DiscoveryTab({ token, onMatchCreated }: { token: string; onMatchCreated: () => void }) {
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

      preconnectCandidatePhotoOrigins(availableCandidates.slice(0, DISCOVERY_RENDERED_STACK_SIZE));

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
                    className={`absolute inset-x-0 top-0 overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${isTopCard ? "touch-pan-y select-none" : "pointer-events-none"
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
