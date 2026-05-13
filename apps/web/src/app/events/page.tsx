"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { EventsTab } from "@/features/events/events-tab";

export default function EventsPage() {
  return (
    <AuthenticatedRoute activeTab="events">
      {({ token, user }) => <EventsTab token={token} user={user} />}
    </AuthenticatedRoute>
  );
}
