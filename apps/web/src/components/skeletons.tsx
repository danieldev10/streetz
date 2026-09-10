"use client";

/**
 * Content-shaped loading placeholders.
 *
 * These mirror the geometry of the real content they stand in for, so a screen
 * keeps its height when data lands instead of jumping. When adding a new one,
 * measure the component it replaces rather than picking a round number.
 */

/**
 * Rows shaped like the app's list cards: optional avatar, one or two text lines,
 * optional trailing action. `className` and `rowClassName` carry the container and
 * row chrome so this also fits the divided table layouts.
 */
export function ListSkeleton({
  label,
  rows = 3,
  className = "grid gap-3",
  rowClassName = "rounded-3xl border border-black/5 bg-surface p-4",
  hasAvatar = true,
  hasAction = true,
  lines = 2,
}: {
  label: string;
  rows?: number;
  className?: string;
  rowClassName?: string;
  hasAvatar?: boolean;
  hasAction?: boolean;
  lines?: 1 | 2;
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`flex animate-pulse items-center gap-3 ${rowClassName}`} aria-hidden="true">
          {hasAvatar ? <div className="size-14 shrink-0 rounded-full bg-black/5" /> : null}
          <div className="min-w-0 flex-1">
            <div className="h-5 w-2/5 rounded-full bg-black/5" />
            {lines === 2 ? <div className="mt-2 h-4 w-3/5 rounded-full bg-black/5" /> : null}
          </div>
          {hasAction ? <div className="h-10 w-24 shrink-0 rounded-full bg-black/5" /> : null}
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A wide cover image above a title, meta lines and an action, for event and profile detail screens. */
export function MediaDetailSkeleton({
  label,
  className = "overflow-hidden rounded-3xl border border-black/5 bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.03)]",
  mediaClassName = "aspect-16/10",
}: {
  label: string;
  className?: string;
  mediaClassName?: string;
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-label={label}>
      <div className="animate-pulse" aria-hidden="true">
        <div className={`bg-brand-shade ${mediaClassName}`} />
        <div className="p-4">
          <div className="h-7 w-2/3 rounded-full bg-black/5" />
          <div className="mt-3 h-4 w-1/2 rounded-full bg-black/5" />
          <div className="mt-2 h-4 w-2/5 rounded-full bg-black/5" />
          <div className="mt-4 h-11 w-full rounded-full bg-black/5" />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Mirrors DiscoveryCandidateCard: tall photo, then bio, interest chips and the action stack. */
export function DiscoveryCardSkeleton({ label = "Loading discovery" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      <div className="animate-pulse" aria-hidden="true">
        <div className="h-[clamp(320px,44svh,440px)] bg-brand-shade md:aspect-[4/5] md:h-auto md:min-h-[440px]" />
        <div className="p-4">
          <div className="h-4 w-full rounded-full bg-black/5" />
          <div className="mt-2 h-4 w-4/5 rounded-full bg-black/5" />
          <div className="mt-3 flex gap-2">
            <div className="h-6.5 w-20 rounded-full bg-black/5" />
            <div className="h-6.5 w-16 rounded-full bg-black/5" />
            <div className="h-6.5 w-24 rounded-full bg-black/5" />
          </div>
          <div className="mt-3 h-11 rounded-full bg-black/5" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="h-11 rounded-full bg-black/5" />
            <div className="h-11 rounded-full bg-black/5" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="h-9 rounded-full bg-black/5" />
            <div className="h-9 rounded-full bg-black/5" />
          </div>
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A titled panel with stacked full-width fields, matching the event and room forms. */
export function FormSkeleton({
  label,
  fields = 5,
  className = "mx-auto max-w-2xl rounded-3xl border border-black/5 bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]",
}: {
  label: string;
  fields?: number;
  className?: string;
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-label={label}>
      <div className="animate-pulse" aria-hidden="true">
        <div className="h-6 w-40 rounded-full bg-black/5" />
        <div className="mt-2 h-4 w-64 max-w-full rounded-full bg-black/5" />
        <div className="mt-4 grid gap-3">
          {Array.from({ length: fields }, (_, index) => (
            <div key={index} className="h-12 rounded-full bg-black/5" />
          ))}
        </div>
        <div className="mt-4 h-12 rounded-full bg-black/5" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Alternating message bubbles for the room, match and support threads. */
export function MessageThreadSkeleton({
  label,
  messages = 6,
  className = "",
}: {
  label: string;
  messages?: number;
  className?: string;
}) {
  const bubbleWidths = ["w-3/5", "w-2/5", "w-4/5", "w-1/2", "w-3/5", "w-2/5"];

  return (
    <div className={`flex flex-col gap-3 p-4 ${className}`} role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: messages }, (_, index) => {
        const isOwn = index % 3 === 2;

        return (
          <div key={index} className={`flex animate-pulse ${isOwn ? "justify-end" : "justify-start"}`} aria-hidden="true">
            <div
              className={`h-14 rounded-[20px] bg-black/5 ${bubbleWidths[index % bubbleWidths.length]}`}
            />
          </div>
        );
      })}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A grid of small stat tiles, matching the admin metrics dashboard. */
export function StatGridSkeleton({
  label,
  tiles = 6,
  className = "",
}: {
  label: string;
  tiles?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {Array.from({ length: tiles }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-3xl border border-black/5 bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
          aria-hidden="true"
        >
          <div className="h-4 w-24 rounded-full bg-black/5" />
          <div className="mt-3 h-8 w-20 rounded-full bg-black/5" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A single detail panel: heading, meta lines, then a body block. */
export function DetailSkeleton({
  label,
  className = "mx-auto max-w-3xl rounded-[28px] border border-black/5 bg-surface p-5 shadow-[0_2px_4px_rgba(0,0,0,0.03)]",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-label={label}>
      <div className="animate-pulse" aria-hidden="true">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="h-6 w-1/2 rounded-full bg-black/5" />
            <div className="mt-2 h-4 w-1/3 rounded-full bg-black/5" />
          </div>
          <div className="h-8 w-20 shrink-0 rounded-full bg-black/5" />
        </div>
        <div className="mt-5 grid gap-2">
          <div className="h-4 w-full rounded-full bg-black/5" />
          <div className="h-4 w-11/12 rounded-full bg-black/5" />
          <div className="h-4 w-4/5 rounded-full bg-black/5" />
        </div>
        <div className="mt-5 h-11 w-full rounded-full bg-black/5" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
