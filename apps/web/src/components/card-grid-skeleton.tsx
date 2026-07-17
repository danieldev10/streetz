"use client";

export function CardGridSkeleton({
  label = "Loading",
  cardCount = 6,
  imageClassName = "h-44 md:h-48",
}: {
  label?: string;
  cardCount?: number;
  imageClassName?: string;
}) {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {Array.from({ length: cardCount }, (_, index) => (
        <div
          key={index}
          className="animate-pulse overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
          aria-hidden="true"
        >
          <div className={`bg-[#f3ebf3] ${imageClassName}`} />
          <div className="p-4">
            <div className="h-5 w-3/4 rounded-full bg-black/5" />
            <div className="mt-3 h-4 w-1/2 rounded-full bg-black/5" />
            <div className="mt-2 h-4 w-2/3 rounded-full bg-black/5" />
            <div className="mt-4 h-11 rounded-full bg-black/5" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
