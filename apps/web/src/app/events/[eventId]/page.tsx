"use client";

import { useParams } from "next/navigation";
import { PublicRoute } from "@/components/app/public-route";
import { EventTicketsTab } from "@/features/events/event-tickets-tab";

export default function EventTicketsPage() {
  const params = useParams<{ eventId: string }>();

  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => (
        <EventTicketsTab token={token} user={user} eventId={params.eventId} onAuthRequired={requestAuth} />
      )}
    </PublicRoute>
  );
}
