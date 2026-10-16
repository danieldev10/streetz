import type { Metadata } from "next";
import { EventPageClient } from "@/features/events/event-page-client";

export const metadata: Metadata = {
  title: "Your tickets | crushclub",
  robots: { index: false, follow: false },
};

export default async function EventTicketsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventPageClient eventId={eventId} view="tickets" />;
}
