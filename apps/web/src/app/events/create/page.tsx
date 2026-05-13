"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { EventsTab } from "@/features/events/events-tab";

export default function CreateEventPage() {
  return (
    <AuthenticatedRoute activeTab="events" adminOnly>
      {({ token, user }) => <EventsTab token={token} user={user} adminMode="create" />}
    </AuthenticatedRoute>
  );
}
