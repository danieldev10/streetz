"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { EventTicketsTab } from "@/features/events/event-tickets-tab";

export default function EventTicketsPage() {
  const params = useParams<{ eventId: string }>();

  return (
    <AuthenticatedRoute activeTab="events">
      {({ token, user }) => <EventTicketsTab token={token} user={user} eventId={params.eventId} />}
    </AuthenticatedRoute>
  );
}
