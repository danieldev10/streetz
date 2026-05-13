"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { EventsTab } from "@/features/events/events-tab";

export default function EditEventPage() {
  const params = useParams<{ eventId: string }>();

  return (
    <AuthenticatedRoute activeTab="events" adminOnly>
      {({ token, user }) => <EventsTab token={token} user={user} adminMode="edit" adminEventId={params.eventId} />}
    </AuthenticatedRoute>
  );
}
