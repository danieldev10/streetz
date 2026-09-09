import { EventsPageClient } from "@/features/events/events-page-client";
import { publicApiRequest } from "@/lib/server-api";
import type { StreetzEvent } from "@/lib/types";

export const revalidate = 60;

export default async function EventsPage() {
  const eventsResponse = await publicApiRequest<{ events: StreetzEvent[] }>("/public/events");

  return <EventsPageClient initialEvents={eventsResponse?.events} />;
}
