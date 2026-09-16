"use client";

import { ListSkeleton } from "@/components/skeletons";

/**
 * Provides stable event-chat geometry while profile readiness is checked.
 */
export function RoomsLoadingView({ label = "Loading event chat" }: { label?: string }) {
  return (
    <section>
      <div className="px-5 pt-6 md:px-8 md:pt-8">
        <div className="mb-4 hidden items-center justify-end md:flex">
          <div className="h-10 w-32 animate-pulse rounded-full bg-black/5" aria-hidden="true" />
        </div>

        {/* Matches the h-11 pill toggle the list renders above its rooms. */}
        <div className="mb-4 h-11 animate-pulse rounded-full bg-black/5 md:max-w-sm" aria-hidden="true" />

        <ListSkeleton label={label} hasAvatar={false} />
      </div>
    </section>
  );
}
