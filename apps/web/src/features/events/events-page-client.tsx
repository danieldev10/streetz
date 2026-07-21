"use client";

import { PublicRoute } from "@/components/app/public-route";
import { EventsTab } from "@/features/events/events-tab";
import type { StreetzEvent, StreetzRaffle } from "@/lib/types";

export function EventsPageClient({ initialEvents, initialRaffles }: {
  initialEvents?: StreetzEvent[];
  initialRaffles?: StreetzRaffle[];
}) {
  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => (
        <EventsTab
          token={token}
          user={user}
          initialEvents={initialEvents}
          initialRaffles={initialRaffles}
          onAuthRequired={requestAuth}
        />
      )}
    </PublicRoute>
  );
}
