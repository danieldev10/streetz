"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, LoaderCircle, MapPin, Ticket } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { StreetzEvent, StreetzEventTicket, StreetzUser, TicketStatus } from "@/lib/types";

const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80";
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["PAID", "CHECKED_IN"]);
const MAX_TICKETS_PER_PURCHASE = 20;

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPrice(priceKobo: number) {
  if (priceKobo <= 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(priceKobo / 100);
}

function formatEventLocation(event: Pick<StreetzEvent, "venue" | "city" | "state">) {
  return [event.venue, event.city, event.state].filter(Boolean).join(", ");
}

function hasEventEnded(event: Pick<StreetzEvent, "startsAt" | "endsAt">) {
  const timestamp = Date.parse(event.endsAt ?? event.startsAt);

  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function isBookableEvent(event: StreetzEvent) {
  return event.status === "PUBLISHED" && !hasEventEnded(event);
}

function getEventTickets(event: StreetzEvent) {
  return event.userTickets ?? (event.userTicket ? [event.userTicket] : []);
}

function getRemainingUserTicketAllowance(event: StreetzEvent) {
  const maxTicketsPerUser = event.ticketType?.maxTicketsPerUser ?? 1;
  const ownedTickets = getEventTickets(event).filter((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status)).length;

  return Math.max(0, maxTicketsPerUser - ownedTickets);
}

function getMaxPurchaseQuantity(event: StreetzEvent) {
  if (!event.ticketType || !isBookableEvent(event)) {
    return 0;
  }

  return Math.max(0, Math.min(event.ticketType.availableCount, getRemainingUserTicketAllowance(event), MAX_TICKETS_PER_PURCHASE));
}

function getTicketState(ticket: StreetzEventTicket) {
  if (ticket.status === "CHECKED_IN") {
    return {
      label: "Used",
      tone: "bg-[#fafafa] text-[#666666]",
      icon: CheckCircle2,
    };
  }

  if (ticket.status === "PAID") {
    return {
      label: "Unused",
      tone: "bg-[#d4fae8] text-[#0b7a50]",
      icon: Ticket,
    };
  }

  return {
    label: ticket.status.toLowerCase(),
    tone: "bg-[#fafafa] text-[#666666]",
    icon: Ticket,
  };
}

export function EventTicketsTab({
  token,
  user,
  eventId,
}: {
  token: string;
  user: StreetzUser;
  eventId: string;
}) {
  const router = useRouter();
  const isAdmin = user.role === "ADMIN";
  const [event, setEvent] = useState<StreetzEvent | null>(null);
  const [isLoading, setIsLoading] = useState(!isAdmin);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [bookingQuantity, setBookingQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const tickets = useMemo(() => {
    const userTickets = event ? getEventTickets(event) : [];

    return userTickets.filter((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status));
  }, [event]);
  const maxPurchaseQuantity = event ? getMaxPurchaseQuantity(event) : 0;
  const selectedQuantity = maxPurchaseQuantity > 0 ? Math.min(Math.max(1, bookingQuantity), maxPurchaseQuantity) : 1;
  const quantityOptions = Array.from({ length: maxPurchaseQuantity }, (_, index) => index + 1);
  const canBookMore = maxPurchaseQuantity > 0;
  const isSoldOut = Boolean(event?.ticketType && event.ticketType.availableCount <= 0);
  const isLimitReached = Boolean(event?.ticketType && isBookableEvent(event) && !isSoldOut && maxPurchaseQuantity <= 0);
  const isBusy = activeEventId === event?.id;

  useEffect(() => {
    let isCancelled = false;

    async function loadEvent() {
      setIsLoading(true);
      setNotice(null);

      try {
        const response = await apiRequest<StreetzEvent>(`/events/${eventId}/tickets`, {
          headers: authHeaders(token),
        });

        if (!isCancelled) {
          setEvent(response);
        }
      } catch (error) {
        if (!isCancelled) {
          setNotice(getUserErrorMessage(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    if (isAdmin) {
      return () => {
        isCancelled = true;
      };
    }

    void loadEvent();

    return () => {
      isCancelled = true;
    };
  }, [eventId, isAdmin, token]);

  async function bookEvent() {
    if (!event?.ticketType || !canBookMore) {
      return;
    }

    const safeQuantity = Math.max(1, Math.min(selectedQuantity, maxPurchaseQuantity));

    if (safeQuantity < 1) {
      return;
    }

    setActiveEventId(event.id);
    setNotice(null);

    try {
      if (event.ticketType.priceKobo <= 0) {
        const updatedEvent = await apiRequest<StreetzEvent>(`/events/${event.id}/book`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ quantity: safeQuantity }),
        });
        setEvent(updatedEvent);
        setBookingQuantity(1);
        setNotice(safeQuantity === 1 ? "Spot booked." : `${safeQuantity} spots booked.`);
        return;
      }

      const response = await apiRequest<{ authorizationUrl?: string }>(`/payments/events/${event.id}/ticket/initialize`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ quantity: safeQuantity }),
      });

      if (!response.authorizationUrl) {
        throw new Error("Paystack did not return a checkout URL.");
      }

      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setActiveEventId(null);
    }
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Tickets"
        title=""
        action={
          <button
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
            type="button"
            onClick={() => router.push("/events")}
            aria-label="Back to events"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {isAdmin ? (
          <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">
            Admins manage events from the admin event page.
          </p>
        ) : null}
        {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoading ? (
          <LoadingState label="Loading tickets" className="min-h-90 rounded-3xl border border-black/5" />
        ) : event ? (
          (() => {
            const isPaidEvent = Boolean(event.ticketType && event.ticketType.priceKobo > 0);
            const isBooked = tickets.length > 0;
            const purchaseNoun = isPaidEvent ? "ticket" : "spot";
            const purchaseNounPlural = isPaidEvent ? "tickets" : "spots";
            const selectedNoun = selectedQuantity === 1 ? purchaseNoun : purchaseNounPlural;

            return (
              <div className="grid gap-4">
                <article className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                  <div className="relative aspect-16/10 bg-[#d4fae8]">
                    <Image
                      src={event.coverImage || FALLBACK_EVENT_IMAGE}
                      alt={`${event.title} event`}
                      fill
                      sizes="(max-width: 768px) 100vw, 720px"
                      className="object-cover"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#0d0d0d]">
                      {event.ticketType ? formatPrice(event.ticketType.priceKobo) : "No ticket"}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      {formatEventDate(event.startsAt)}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">{event.title}</h2>
                    <p className="mt-1 flex items-center gap-1 text-sm text-[#666666]">
                      <MapPin className="size-4" aria-hidden="true" />
                      {formatEventLocation(event)}
                    </p>
                    {event.ticketType ? (
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">{event.ticketType.availableCount} spots left</span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">Max {event.ticketType.maxTicketsPerUser} per person</span>
                      </div>
                    ) : null}
                    {event.status === "CANCELLED" ? (
                      <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm leading-6 text-red-700">
                        This event was cancelled. If you paid for a ticket, refunds are being processed and we will contact you by email.
                      </p>
                    ) : null}
                    {canBookMore && maxPurchaseQuantity > 1 ? (
                      <label className="mt-4 grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                        Quantity
                        <select
                          className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                          value={selectedQuantity}
                          onChange={(inputEvent) => setBookingQuantity(Number(inputEvent.target.value))}
                          disabled={isBusy}
                        >
                          {quantityOptions.map((quantity) => (
                            <option key={quantity} value={quantity}>
                              {quantity} {quantity === 1 ? purchaseNoun : purchaseNounPlural}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <button
                      className={`${canBookMore && maxPurchaseQuantity > 1 ? "mt-3" : "mt-4"} inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60`}
                      type="button"
                      onClick={() => void bookEvent()}
                      disabled={!canBookMore || isBusy}
                    >
                      {isBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                      {!event.ticketType
                        ? "No tickets available"
                        : isSoldOut
                          ? "Sold out"
                          : isLimitReached
                            ? "Ticket limit reached"
                            : !isBookableEvent(event)
                              ? "Event unavailable"
                              : isBooked && selectedQuantity === 1
                                ? `${isPaidEvent ? "Buy" : "Book"} another ${purchaseNoun}`
                                : isBooked
                                  ? `${isPaidEvent ? "Buy" : "Book"} ${selectedQuantity} more ${purchaseNounPlural}`
                                  : `${isPaidEvent ? "Buy" : "Book"} ${selectedQuantity} ${selectedNoun}`}
                    </button>
                  </div>
                </article>

                <div className="grid gap-3">
                  {tickets.length > 0 ? (
                    tickets.map((ticket, index) => {
                      const state = getTicketState(ticket);
                      const Icon = state.icon;

                      return (
                        <article key={ticket.id} className="rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Ticket {tickets.length - index}</p>
                              <p className="mt-2 truncate text-lg font-semibold text-[#0d0d0d]">{ticket.code}</p>
                              <p className="mt-1 text-sm text-[#666666]">Booked {formatEventDate(ticket.createdAt)}</p>
                              {ticket.checkedInAt ? (
                                <p className="mt-1 text-sm text-[#666666]">Used {formatEventDate(ticket.checkedInAt)}</p>
                              ) : null}
                            </div>
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${state.tone}`}>
                              <Icon className="size-3.5" aria-hidden="true" />
                              {state.label}
                            </span>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="grid min-h-48 place-items-center rounded-3xl border border-black/5 p-6 text-center">
                      <div>
                        <Ticket className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                        <h2 className="mt-3 text-2xl font-semibold">No tickets yet</h2>
                        <p className="mt-2 text-sm text-[#666666]">Book this event to see your tickets here.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
            <div>
              <Ticket className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">Event unavailable</h2>
              <p className="mt-2 text-sm text-[#666666]">This event could not be loaded.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
