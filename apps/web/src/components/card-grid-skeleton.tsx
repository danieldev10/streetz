"use client";

/**
 * Mirrors EventCardList's card geometry so the grid keeps its height when events land.
 * Card heights line up at roughly 168px of content (206px with the ticket tier chips),
 * matching the real card's `text-lg` title, two meta lines and `h-11` action button.
 */
export function CardGridSkeleton({
  label = "Loading",
  cardCount = 3,
  imageClassName = "h-44 md:h-52",
  hasTicketChips = false,
}: {
  label?: string;
  cardCount?: number;
  imageClassName?: string;
  hasTicketChips?: boolean;
}) {
  return (
    <div
      className="grid gap-4 md:gap-5 min-[960px]:grid-cols-2 min-[1360px]:grid-cols-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {Array.from({ length: cardCount }, (_, index) => {
        const visibilityClass =
          index === 0 ? "" : index === 1 ? "hidden min-[960px]:block" : index === 2 ? "hidden min-[1360px]:block" : "hidden";

        return (
          <div
            key={index}
            className={`${visibilityClass} animate-pulse overflow-hidden rounded-3xl border border-line/5 bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.03)]`}
            aria-hidden="true"
          >
            <div className={`bg-brand-shade ${imageClassName}`} />
            <div className="p-4">
              <div className="h-6 w-3/4 rounded-full bg-ink/5" />
              <div className="mt-2 h-5 w-1/2 rounded-full bg-ink/5" />
              <div className="mt-2 h-4 w-2/3 rounded-full bg-ink/5" />
              {hasTicketChips ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="h-6.5 w-24 rounded-full bg-ink/5" />
                  <div className="h-6.5 w-20 rounded-full bg-ink/5" />
                </div>
              ) : null}
              <div className="mt-4 h-11 rounded-full bg-ink/5" />
            </div>
          </div>
        );
      })}
      <span className="sr-only">{label}</span>
    </div>
  );
}
