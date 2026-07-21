"use client";

import { PublicRoute } from "@/components/app/public-route";
import { EventTicketsTab } from "@/features/events/event-tickets-tab";
import type { StreetzEvent } from "@/lib/types";

export function EventPageClient({ eventId, initialEvent }: { eventId: string; initialEvent?: StreetzEvent | null }) {
  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => (
        <EventTicketsTab token={token} user={user} eventId={eventId} initialEvent={initialEvent} onAuthRequired={requestAuth} />
      )}
    </PublicRoute>
  );
}
