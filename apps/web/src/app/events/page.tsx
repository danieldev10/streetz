import { EventsPageClient } from "@/features/events/events-page-client";
import { publicApiRequest } from "@/lib/server-api";
import type { StreetzEvent } from "@/lib/types";

export const revalidate = 0;

export default async function EventsPage() {
  const eventsResponse = await publicApiRequest<{ events: StreetzEvent[] }>("/public/events", 0);

  return <EventsPageClient initialEvents={eventsResponse?.events} />;
}
