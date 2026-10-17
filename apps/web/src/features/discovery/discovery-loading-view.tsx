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
      <div className="px-5 pb-8 pt-6 md:hidden">
        <div className="mb-4 flex items-center justify-end">
          <div className="h-10 w-28 animate-pulse rounded-full bg-black/5" aria-hidden="true" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(360px,520px)_1fr]">
          <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.03)] xl:max-w-[520px]">
            <DiscoveryCardSkeleton label={label} />
          </article>
        </div>
      </div>
      <div className="hidden px-8 py-8 md:block" role="status" aria-label={label}>
        <div className="animate-pulse" aria-hidden="true">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="h-9 w-60 rounded-full bg-black/5" />
              <div className="mt-2 h-6 w-72 rounded-full bg-black/5" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-28 rounded-full bg-black/5" />
              <div className="h-10 w-36 rounded-full bg-black/5" />
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between py-3">
            <div className="h-4 w-20 rounded-full bg-black/5" />
            <div className="h-4 w-24 rounded-full bg-black/5" />
          </div>
          <div className="grid gap-4 min-[1200px]:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 rounded-[22px] border border-black/5 bg-surface p-4">
                <div className="size-20 shrink-0 rounded-[18px] bg-brand-shade" />
                <div className="min-w-0 flex-1">
                  <div className="h-5 w-24 rounded-full bg-black/5" />
                  <div className="mt-2 h-4 w-20 rounded-full bg-black/5" />
                </div>
                <div className="size-10 shrink-0 rounded-full bg-black/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
