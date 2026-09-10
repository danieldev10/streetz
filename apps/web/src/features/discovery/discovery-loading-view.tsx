"use client";

import { DiscoveryCardSkeleton } from "@/components/skeletons";

/**
 * Mirrors DiscoveryTab's loading layout, including the filter row and the card
 * column, so the app shell, the profile gate and the tab itself all render the
 * same geometry. Opening /discover then reads as one continuous skeleton rather
 * than three loading states of different heights.
 */
export function DiscoveryLoadingView({ label = "Loading discovery" }: { label?: string }) {
  return (
    <section>
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <div className="mb-4 flex items-center justify-end">
          <div className="h-10 w-28 animate-pulse rounded-full bg-black/5" aria-hidden="true" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(360px,520px)_1fr]">
          <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.03)] xl:max-w-[520px]">
            <DiscoveryCardSkeleton label={label} />
          </article>
        </div>
      </div>
    </section>
  );
}
