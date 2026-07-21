import { EventsPageClient } from "@/features/events/events-page-client";
import { publicApiRequest } from "@/lib/server-api";
import type { StreetzEvent, StreetzRaffle } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [eventsResponse, rafflesResponse] = await Promise.all([
    publicApiRequest<{ events: StreetzEvent[] }>("/public/events"),
    publicApiRequest<{ raffles: StreetzRaffle[] }>("/public/raffles", 60)
  ]);

  return <EventsPageClient initialEvents={eventsResponse?.events} initialRaffles={rafflesResponse?.raffles} />;
}
