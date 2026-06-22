"use client";

import { PublicRoute } from "@/components/app/public-route";
import { EventsTab } from "@/features/events/events-tab";

export default function EventsPage() {
  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => <EventsTab token={token} user={user} onAuthRequired={requestAuth} />}
    </PublicRoute>
  );
}
