"use client";

import { EventsTab } from "@/features/events/events-tab";
import type { StreetzUser } from "@/lib/types";

export function AdminEventForm({ token, user, mode, eventId }: {
  token: string;
  user: StreetzUser;
  mode: "create" | "edit";
  eventId?: string | null;
}) {
  return <EventsTab token={token} user={user} adminMode={mode} adminEventId={eventId} />;
}
