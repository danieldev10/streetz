import type { Metadata } from "next";
import { EventPageClient } from "@/features/events/event-page-client";
import { publicApiRequest } from "@/lib/server-api";
import type { StreetzEvent } from "@/lib/types";

type EventPageProps = { params: Promise<{ eventId: string }> };

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await publicApiRequest<StreetzEvent>(`/public/events/${eventId}`);

  if (!event) return { title: "Event unavailable | crushclub" };

  const description = event.description || `Get tickets for ${event.title} on crushclub.`;
  return {
    title: `${event.title} | crushclub`,
    description,
    alternates: { canonical: `/events/${event.id}` },
    openGraph: {
      title: event.title,
      description,
      type: "website",
      ...(event.coverImage ? { images: [{ url: event.coverImage, alt: event.title }] } : {})
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      ...(event.coverImage ? { images: [event.coverImage] } : {})
    }
  };
}

export default async function EventTicketsPage({ params }: EventPageProps) {
  const { eventId } = await params;
  const event = await publicApiRequest<StreetzEvent>(`/public/events/${eventId}`);

  return <EventPageClient eventId={eventId} initialEvent={event} />;
}
