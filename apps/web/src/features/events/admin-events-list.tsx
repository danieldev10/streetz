"use client";

import { EventsTab } from "@/features/events/events-tab";
import type { StreetzUser } from "@/lib/types";

export function AdminEventsList({ token, user }: { token: string; user: StreetzUser }) {
  return <EventsTab token={token} user={user} adminMode="list" />;
}
