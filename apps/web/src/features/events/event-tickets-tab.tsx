"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, LoaderCircle, MapPin, Share2, Ticket } from "lucide-react";
import { type AuthPromptKind } from "@/components/app/public-route";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { consumePendingEventCheckoutNotice, savePendingEventCheckout } from "@/lib/pending-event-checkout";
import { getAbsoluteAppUrl, shareOrCopyLink } from "@/lib/share";
import type { StreetzEvent, StreetzEventTicket, StreetzEventTicketType, StreetzUser, TicketStatus } from "@/lib/types";

const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80";
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["PAID", "CHECKED_IN"]);
const MAX_TICKETS_PER_PURCHASE = 20;
const EVENT_TICKET_TIER_NAMES = ["Regular", "VIP", "Tables"] as const;
type EventTicketTierName = (typeof EVENT_TICKET_TIER_NAMES)[number];

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

function normalizeTicketTierName(name: string): EventTicketTierName {
  if (name === "General Admission") {
    return "Regular";
  }

  if ((EVENT_TICKET_TIER_NAMES as readonly string[]).includes(name)) {
    return name as EventTicketTierName;
  }

  return "Regular";
}

function getEventTicketTypes(event: StreetzEvent) {
  const ticketTypes = event.ticketTypes?.length ? event.ticketTypes : event.ticketType ? [event.ticketType] : [];

  return [...ticketTypes].sort(
    (first, second) =>
      EVENT_TICKET_TIER_NAMES.indexOf(normalizeTicketTierName(first.name)) -
      EVENT_TICKET_TIER_NAMES.indexOf(normalizeTicketTierName(second.name))
  );
}

function getSelectedTicketType(event: StreetzEvent, selectedTicketTypeId: string | null) {
  const ticketTypes = getEventTicketTypes(event);

  return ticketTypes.find((ticketType) => ticketType.id === selectedTicketTypeId) ?? ticketTypes[0] ?? null;
}

function getRemainingUserTicketAllowance(event: StreetzEvent, ticketType: StreetzEventTicketType | null) {
  if (!ticketType?.id) {
    return 0;
  }

  const ownedTickets = getEventTickets(event).filter(
    (ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status) && ticket.ticketType?.id === ticketType.id
  ).length;

  return Math.max(0, ticketType.maxTicketsPerUser - ownedTickets);
}

function getMaxPurchaseQuantity(event: StreetzEvent, ticketType: StreetzEventTicketType | null) {
  if (!ticketType || !isBookableEvent(event)) {
    return 0;
  }

  return Math.max(0, Math.min(ticketType.availableCount, getRemainingUserTicketAllowance(event, ticketType), MAX_TICKETS_PER_PURCHASE));
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
  onAuthRequired,
}: {
  token?: string | null;
  user?: StreetzUser | null;
  eventId: string;
  onAuthRequired?: (kind?: AuthPromptKind) => void;
}) {
  const router = useRouter();
  const isGuest = !token || !user;
  const isAdmin = user?.role === "ADMIN";
  const [event, setEvent] = useState<StreetzEvent | null>(null);
  const [isLoading, setIsLoading] = useState(!isAdmin);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [bookingQuantity, setBookingQuantity] = useState(1);
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ticketTypes = useMemo(() => (event ? getEventTicketTypes(event) : []), [event]);
  const selectedTicketType = event ? getSelectedTicketType(event, selectedTicketTypeId) : null;
  const tickets = useMemo(() => {
    const userTickets = event ? getEventTickets(event) : [];

    return userTickets.filter((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status));
  }, [event]);
  const maxPurchaseQuantity = event ? getMaxPurchaseQuantity(event, selectedTicketType) : 0;
  const selectedQuantity = maxPurchaseQuantity > 0 ? Math.min(Math.max(1, bookingQuantity), maxPurchaseQuantity) : 1;
  const quantityOptions = Array.from({ length: maxPurchaseQuantity }, (_, index) => index + 1);
  const canBookMore = maxPurchaseQuantity > 0;
  const isSoldOut = Boolean(selectedTicketType && selectedTicketType.availableCount <= 0);
  const isLimitReached = Boolean(event && selectedTicketType && isBookableEvent(event) && !isSoldOut && maxPurchaseQuantity <= 0);
  const isBusy = activeEventId === event?.id;

  useEffect(() => {
    const checkoutNotice = consumePendingEventCheckoutNotice();

    if (!checkoutNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(checkoutNotice), 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadEvent() {
      setIsLoading(true);

      try {
        const response = await apiRequest<StreetzEvent>(
          isGuest ? `/public/events/${eventId}` : `/events/${eventId}/tickets`,
          isGuest ? undefined : { headers: authHeaders(token as string) }
        );

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
  }, [eventId, isAdmin, isGuest, token]);

  async function shareEvent(ticket?: StreetzEventTicket) {
    if (!event) {
      return;
    }

    const tierName = ticket?.ticketType ? normalizeTicketTierName(ticket.ticketType.name) : null;

    try {
      const result = await shareOrCopyLink({
        title: event.title,
        text: ticket
          ? `I have a ${tierName ?? "ticket"} ticket for ${event.title} on Crushclub.`
          : `Check out ${event.title} on Crushclub.`,
        url: getAbsoluteAppUrl(`/events/${event.id}`),
      });

      if (result === "copied") {
        setNotice(ticket ? "Ticket share link copied." : "Event link copied.");
      }
    } catch {
      setNotice("Could not copy link right now.");
    }
  }

  async function bookEvent() {
    if (!event || !selectedTicketType) {
      return;
    }

    const guestMaxQuantity = Math.min(selectedTicketType.availableCount, MAX_TICKETS_PER_PURCHASE);
    const safeQuantity = Math.max(1, Math.min(selectedQuantity, isGuest ? guestMaxQuantity : maxPurchaseQuantity));

    if (safeQuantity < 1) {
      return;
    }

    if (isGuest) {
      savePendingEventCheckout({ eventId: event.id, ticketTypeId: selectedTicketType.id, quantity: safeQuantity });
      onAuthRequired?.("eventTicket");
      return;
    }

    if (!token || !canBookMore) {
      return;
    }

    setActiveEventId(event.id);
    setNotice(null);

    try {
      if (selectedTicketType.priceKobo <= 0) {
        const updatedEvent = await apiRequest<StreetzEvent>(`/events/${event.id}/book`, {
          method: "POST",
          headers: authHeaders(token as string),
          body: JSON.stringify({ quantity: safeQuantity, ticketTypeId: selectedTicketType.id }),
        });
        setEvent(updatedEvent);
        setBookingQuantity(1);
        setNotice(safeQuantity === 1 ? "Spot booked." : `${safeQuantity} spots booked.`);
        return;
      }

      const response = await apiRequest<{ authorizationUrl?: string }>(`/payments/events/${event.id}/ticket/initialize`, {
        method: "POST",
        headers: authHeaders(token as string),
        body: JSON.stringify({ quantity: safeQuantity, ticketTypeId: selectedTicketType.id }),
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
        eyebrow={isGuest ? "Event" : "Tickets"}
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
            const isPaidEvent = Boolean(selectedTicketType && selectedTicketType.priceKobo > 0);
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
                      {selectedTicketType ? `${normalizeTicketTierName(selectedTicketType.name)} · ${formatPrice(selectedTicketType.priceKobo)}` : "No ticket"}
                    </span>
                    <button
                      className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-white/90 text-[#0d0d0d] shadow-sm backdrop-blur transition hover:bg-white"
                      type="button"
                      onClick={() => void shareEvent()}
                      aria-label={`Share ${event.title}`}
                      title="Share event"
                    >
                      <Share2 className="size-4" aria-hidden="true" />
                    </button>
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
                    {ticketTypes.length > 1 ? (
                      <label className="mt-4 grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                        Tier
                        <select
                          className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                          value={selectedTicketType?.id ?? ""}
                          onChange={(inputEvent) => {
                            setSelectedTicketTypeId(inputEvent.target.value);
                            setBookingQuantity(1);
                          }}
                          disabled={isBusy}
                        >
                          {ticketTypes.map((ticketType) => (
                            <option key={ticketType.id} value={ticketType.id}>
                              {normalizeTicketTierName(ticketType.name)} · {formatPrice(ticketType.priceKobo)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {selectedTicketType ? (
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">{selectedTicketType.availableCount} spots left</span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">Max {selectedTicketType.maxTicketsPerUser} per person</span>
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
                      {!selectedTicketType
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

                {!isGuest ? (
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
                              {ticket.ticketType ? (
                                <p className="mt-1 text-sm font-medium text-[#666666]">{normalizeTicketTierName(ticket.ticketType.name)}</p>
                              ) : null}
                              <p className="mt-1 text-sm text-[#666666]">Booked {formatEventDate(ticket.createdAt)}</p>
                              {ticket.checkedInAt ? (
                                <p className="mt-1 text-sm text-[#666666]">Used {formatEventDate(ticket.checkedInAt)}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                className="inline-flex size-9 items-center justify-center rounded-full border border-black/8 text-[#666666] transition hover:border-[#18E299] hover:text-[#0d0d0d]"
                                type="button"
                                onClick={() => void shareEvent(ticket)}
                                aria-label={`Share ${event.title} ticket`}
                                title="Share ticket"
                              >
                                <Share2 className="size-4" aria-hidden="true" />
                              </button>
                              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${state.tone}`}>
                                <Icon className="size-3.5" aria-hidden="true" />
                                {state.label}
                              </span>
                            </div>
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
                ) : null}
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
