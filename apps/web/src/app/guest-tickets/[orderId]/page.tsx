"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, LoaderCircle, MapPin, Ticket } from "lucide-react";
import { apiRequest, getUserErrorMessage } from "@/lib/api";

type ManagedGuestBooking = {
  orderId: string;
  email: string;
  displayName: string;
  event: { id: string; title: string; venue: string; state: string | null; city: string; startsAt: string; endsAt: string | null };
  ticketType: { id: string; name: string; priceKobo: number };
  tickets: Array<{ id: string; code: string; status: string; checkedInAt: string | null; createdAt: string }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(value));
}

export default function GuestTicketsPage() {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [booking, setBooking] = useState<ManagedGuestBooking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setError("This ticket link is invalid.");
        return;
      }
      try {
        const response = await apiRequest<ManagedGuestBooking>(`/public/guest-ticket-orders/${encodeURIComponent(params.orderId)}?token=${encodeURIComponent(token)}`);
        if (!cancelled) setBooking(response);
      } catch (caught) {
        if (!cancelled) setError(getUserErrorMessage(caught));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [params.orderId, token]);

  if (!booking && !error) return <main className="grid min-h-screen place-items-center"><LoaderCircle className="size-6 animate-spin text-[#9d2a9e]" aria-label="Loading tickets" /></main>;
  if (error) return <main className="grid min-h-screen place-items-center px-5"><div className="max-w-sm text-center"><h1 className="text-2xl font-semibold">Tickets unavailable</h1><p className="mt-2 text-sm text-[#666]">{error}</p><Link className="mt-5 inline-flex rounded-full bg-black px-5 py-3 text-sm text-white" href="/events">Browse events</Link></div></main>;

  return (
    <main className="min-h-screen bg-[#fafafa] px-5 py-8 text-[#0d0d0d]">
      <section className="mx-auto max-w-lg rounded-[28px] bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9d2a9e]">Guest tickets</p>
        <h1 className="mt-2 text-2xl font-semibold">{booking!.event.title}</h1>
        <p className="mt-3 flex gap-2 text-sm text-[#666]"><CalendarDays className="size-4 shrink-0" />{formatDate(booking!.event.startsAt)}</p>
        <p className="mt-2 flex gap-2 text-sm text-[#666]"><MapPin className="size-4 shrink-0" />{[booking!.event.venue, booking!.event.city, booking!.event.state].filter(Boolean).join(", ")}</p>
        <div className="mt-6 grid gap-3">
          {booking!.tickets.map((ticket, index) => (
            <article key={ticket.id} className="rounded-[20px] border border-black/8 bg-[#fafafa] p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888]"><Ticket className="size-4" />{booking!.ticketType.name} · Ticket {index + 1}</p>
              <p className="mt-2 break-all font-mono text-xl font-bold tracking-wide">{ticket.code}</p>
              <p className="mt-1 text-xs text-[#666]">{ticket.status === "CHECKED_IN" ? "Checked in" : "Ready to use"}</p>
            </article>
          ))}
        </div>
        <p className="mt-5 text-xs leading-5 text-[#666]">Booked for {booking!.displayName} · {booking!.email}</p>
        <Link className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-5 text-sm font-medium" href={`/events/${booking!.event.id}`}>View event</Link>
      </section>
    </main>
  );
}
