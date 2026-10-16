"use client";

import { PublicRoute } from "@/components/app/public-route";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { EventTicketsTab } from "@/features/events/event-tickets-tab";
import type { StreetzEvent } from "@/lib/types";

export function EventPageClient({ eventId, initialEvent, view = "details" }: {
  eventId: string;
  initialEvent?: StreetzEvent | null;
  view?: "details" | "tickets";
}) {
  if (view === "tickets") {
    return (
      <AuthenticatedRoute activeTab="events">
        {({ token, user }) => <EventTicketsTab key={eventId} token={token} user={user} eventId={eventId} view="tickets" />}
      </AuthenticatedRoute>
    );
  }

  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => (
        <EventTicketsTab key={eventId} token={token} user={user} eventId={eventId} initialEvent={initialEvent} onAuthRequired={requestAuth} />
      )}
    </PublicRoute>
  );
}
