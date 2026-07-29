import { Ban, Eye, Flag, Heart, MapPin, Ticket, X } from "lucide-react";
import { formatDistanceKm } from "@/lib/location";
import { formatConnectionStatus } from "@/lib/profile";
import type { DiscoveryActionName, DiscoveryCandidate } from "@/lib/types";
import { CandidatePhoto } from "./candidate-photo";

export function DiscoveryCandidateCard({
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
      <div className="relative h-[clamp(320px,44svh,440px)] bg-[#f6e0f6] md:aspect-[4/5] md:h-auto md:min-h-[440px]">
        <CandidatePhoto candidate={candidate} priority={priority} />
        <div
          className={`absolute left-5 top-5 rounded-[14px] border-2 px-4 py-2 text-lg font-semibold uppercase tracking-[0.08em] transition-opacity ${
            swipeIntent === "PASS"
              ? "border-white bg-white/90 text-[#0d0d0d] opacity-100"
              : "border-white/60 text-white opacity-0"
          }`}
        >
          Pass
        </div>
        <div
          className={`absolute right-5 top-5 rounded-[14px] border-2 px-4 py-2 text-lg font-semibold uppercase tracking-[0.08em] transition-opacity ${
            swipeIntent === "LIKE"
              ? "border-[#bd40be] bg-[#9d2a9e]/90 text-white opacity-100"
              : "border-[#bd40be]/60 text-[#bd40be] opacity-0"
          }`}
        >
          Like
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 text-white md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
              {formatConnectionStatus(candidate.connectionStatus)}
            </span>
            {candidate.attendedEventCount > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#0d0d0d]"
                aria-label={`${candidate.attendedEventCount} attended events`}
                title={`${candidate.attendedEventCount} attended events`}
              >
                <Ticket className="size-3.5" aria-hidden="true" />
                {candidate.attendedEventCount}
              </span>
            ) : null}
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
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#9d2a9e] text-white disabled:cursor-not-allowed disabled:opacity-60"
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
