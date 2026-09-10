"use client";

import { ListSkeleton } from "@/components/skeletons";

/**
 * Mirrors RoomsListView's loading layout, including the connection pill row and
 * the Joined/Explore toggle, so the app shell, the profile gate and the list all
 * render the same geometry and hand over without a shift.
 */
export function RoomsLoadingView({ label = "Loading rooms" }: { label?: string }) {
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
