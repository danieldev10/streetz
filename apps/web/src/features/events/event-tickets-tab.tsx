"use client";

import { TicketQrCode } from "@/components/ticket-qr-code";

import { ActionButton } from "@/components/action-button";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Download, MapPin, MessageCircle, Share2, Ticket, UsersRound } from "lucide-react";
import { type AuthPromptKind } from "@/components/app/public-route";
import { useToast } from "@/components/app/toast-provider";
import { MediaDetailSkeleton } from "@/components/skeletons";
import { ApiError, apiRequest, authHeaders, downloadApiFile, getUserErrorMessage } from "@/lib/api";
import { consumePendingEventCheckoutNotice, savePendingEventCheckout } from "@/lib/pending-event-checkout";
import { getAbsoluteAppUrl, shareOrCopyLink } from "@/lib/share";
import type { StreetzEvent, StreetzEventTicket, StreetzEventTicketType, StreetzUser, TicketStatus } from "@/lib/types";
import type { GuestTicketBooking } from "@/features/events/ticket-checkout-modal";
import { formatEventDateRange, getMaxPurchaseQuantity } from "@/features/events/event-display";

const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80";
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["CONFIRMED", "PAID", "CHECKED_IN"]);
const EVENT_TICKET_TIER_NAMES = ["Early Bird", "Regular", "VIP", "Tables"] as const;
type EventTicketTierName = (typeof EVENT_TICKET_TIER_NAMES)[number];
const TicketCheckoutModal = dynamic(() =>
  import("@/features/events/ticket-checkout-modal").then((module) => module.TicketCheckoutModal)
);

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
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

function getTicketState(ticket: StreetzEventTicket) {
  if (ticket.status === "CHECKED_IN") {
    return {
      label: "Used",
      tone: "bg-surface-muted text-ink-600",
      icon: CheckCircle2,
    };
  }

  if (ticket.status === "PAID" || ticket.status === "CONFIRMED") {
    return {
      label: "Unused",
      tone: "bg-brand-tint text-brand-deep",
      icon: Ticket,
    };
  }

  return {
    label: ticket.status.toLowerCase(),
    tone: "bg-surface-muted text-ink-600",
    icon: Ticket,
  };
}

export function EventTicketsTab({
  token,
  user,
  eventId,
  initialEvent,
  onAuthRequired,
  view = "details",
}: {
  token?: string | null;
  user?: StreetzUser | null;
  eventId: string;
  initialEvent?: StreetzEvent | null;
  onAuthRequired?: (kind?: AuthPromptKind) => void;
  view?: "details" | "tickets";
}) {
  const router = useRouter();
  const isGuest = !token || !user;
  const isAdmin = user?.role === "ADMIN";
  const [event, setEvent] = useState<StreetzEvent | null>(initialEvent ?? null);
  const [isLoading, setIsLoading] = useState(!isAdmin && initialEvent === undefined);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [isRoomBusy, setIsRoomBusy] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [guestTicketsUrl, setGuestTicketsUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { showToast } = useToast();

  const ticketTypes = useMemo(() => (event ? getEventTicketTypes(event) : []), [event]);
  const tickets = useMemo(() => {
    const userTickets = event ? getEventTickets(event) : [];

    return userTickets.filter((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status));
  }, [event]);
  const isSoldOut = ticketTypes.every((ticketType) => ticketType.availableCount <= 0);
  const canBookMore = Boolean(event && isBookableEvent(event) && ticketTypes.some((ticketType) =>
    isGuest ? ticketType.availableCount > 0 : getMaxPurchaseQuantity(event, ticketType) > 0
  ));
  const getTicketsLabel = !ticketTypes.length ? "No tickets available"
    : isSoldOut ? "Sold out"
      : event && !isBookableEvent(event) ? "Event unavailable"
        : !canBookMore ? "Ticket limit reached" : "Get tickets";
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
    let pending = false;
    let lastRefreshAt = 0;

    async function loadEvent(showLoading = false) {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      lastRefreshAt = Date.now();
      if (showLoading) setIsLoading(true);

      try {
        const response = await apiRequest<StreetzEvent>(
          isGuest ? `/public/events/${eventId}` : `/events/${eventId}/tickets`,
          { cache: "no-store", ...(!isGuest ? { headers: authHeaders(token as string) } : {}) }
        );

        if (!isCancelled) {
          setEvent(response);
        }
      } catch (error) {
        if (!isCancelled) {
          if (error instanceof ApiError && error.status === 404) setEvent(null);
          setNotice(getUserErrorMessage(error));
        }
      } finally {
        pending = false;
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

    const timer = window.setTimeout(() => void loadEvent(!isGuest || initialEvent === undefined), 0);
    const interval = window.setInterval(() => void loadEvent(), 60_000);
    function refreshOnReturn() {
      if (Date.now() - lastRefreshAt > 5_000) void loadEvent();
    }
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [eventId, initialEvent, isAdmin, isGuest, token]);

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
        showToast(ticket ? "Ticket share link copied." : "Event link copied.");
      }
    } catch {
      showToast("Could not copy link right now.", { tone: "error" });
    }
  }

  async function openTicketCheckout() {
    if (!event || !canBookMore || isBusy || isAdmin) return;
    setNotice(null);
    try {
      await import("@/features/events/ticket-checkout-modal");
      setIsCheckoutOpen(true);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    }
  }

  async function bookEvent(ticketType: StreetzEventTicketType, quantity: number) {
    if (!event || !isBookableEvent(event) || isBusy || isAdmin) {
      return;
    }

    const maxQuantity = isGuest
      ? Math.min(ticketType.availableCount, ticketType.maxTicketsPerUser, 20)
      : getMaxPurchaseQuantity(event, ticketType);
    if (maxQuantity < 1) return;
    const safeQuantity = Math.max(1, Math.min(quantity, maxQuantity));

    if (isGuest) {
      savePendingEventCheckout({ eventId: event.id, ticketTypeId: ticketType.id, quantity: safeQuantity });
      setIsCheckoutOpen(false);
      onAuthRequired?.("eventTicket");
      return;
    }

    if (!token) {
      return;
    }

    setActiveEventId(event.id);
    setNotice(null);

    try {
      if (ticketType.priceKobo <= 0) {
        const updatedEvent = await apiRequest<StreetzEvent>(`/events/${event.id}/book`, {
          method: "POST",
          headers: authHeaders(token as string),
          body: JSON.stringify({ quantity: safeQuantity, ticketTypeId: ticketType.id }),
        });
        setEvent(updatedEvent);
        setIsCheckoutOpen(false);
        setNotice(safeQuantity === 1 ? "Spot booked." : `${safeQuantity} spots booked.`);
        return;
      }

      const response = await apiRequest<{ authorizationUrl?: string }>(`/payments/events/${event.id}/ticket/initialize`, {
        method: "POST",
        headers: authHeaders(token as string),
        body: JSON.stringify({ quantity: safeQuantity, ticketTypeId: ticketType.id }),
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

  function applyGuestBooking(booking: GuestTicketBooking) {
    setGuestTicketsUrl(booking.manageUrl);
    setEvent((current) => {
      if (!current || current.id !== booking.event.id) {
        return current;
      }

      const bookedCount = booking.tickets.length;
      const updateTicketType = (ticketType: StreetzEventTicketType) => ticketType.id === booking.ticketType.id
        ? {
            ...ticketType,
            soldCount: ticketType.soldCount + bookedCount,
            availableCount: Math.max(0, ticketType.availableCount - bookedCount)
          }
        : ticketType;

      return {
        ...current,
        ticketTypes: current.ticketTypes.map(updateTicketType),
        ticketType: current.ticketType ? updateTicketType(current.ticketType) : null
      };
    });
  }

  async function openEventRoom() {
    if (!event?.room) {
      return;
    }

    if (isGuest || event.room.readOnly || !token) {
      router.push(`/rooms/${event.room.id}`);
      return;
    }

    setIsRoomBusy(true);
    setNotice(null);

    try {
      if (!event.room.hasJoined) {
        await apiRequest(`/rooms/${event.room.id}/join`, {
          method: "POST",
          headers: authHeaders(token),
        });
        setEvent((current) => current?.room
          ? { ...current, room: { ...current.room, hasJoined: true } }
          : current);
      }

      router.push(`/rooms/${event.room.id}`);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsRoomBusy(false);
    }
  }

  async function downloadTickets() {
    if (!event || !token) return;
    setNotice(null);
    try {
      await downloadApiFile(`/events/${encodeURIComponent(event.id)}/tickets/download`, "crushclub-tickets.pdf", { headers: authHeaders(token) });
    } catch (error) { setNotice(getUserErrorMessage(error)); }
  }

  return (
    <section>
      {!event ? <h1 className="sr-only">{view === "tickets" ? "Your tickets" : "Event details"}</h1> : null}
      {isCheckoutOpen && event ? (
        <TicketCheckoutModal
          event={event}
          isGuest={isGuest}
          isBusy={isBusy}
          errorMessage={notice}
          onClose={() => setIsCheckoutOpen(false)}
          onSubmit={bookEvent}
          onGuestBooked={applyGuestBooking}
        />
      ) : null}
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <div className="mb-4 flex items-center gap-2">
          <ActionButton
            trackNavigation icon={<ArrowLeft className="size-4" aria-hidden="true" />}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 md:w-auto md:gap-2 md:bg-surface md:px-4"
            type="button"
            onClick={() => router.push(view === "tickets" ? `/events/${eventId}` : "/events")}
            aria-label={view === "tickets" ? "Back to event details" : "Back to events"}
            title="Back"
          >
            <span className="hidden text-sm font-medium md:inline">{view === "tickets" ? "Event details" : "Events"}</span>
          </ActionButton>
          {event && !isAdmin && !isLoading ? (
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {view === "details" && (tickets.length > 0 || guestTicketsUrl) ? (
                <ActionButton trackNavigation type="button"
                  icon={<Ticket className="size-4 shrink-0" aria-hidden="true" />}
                  className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-black/8 px-3 text-xs font-semibold sm:px-4 sm:text-sm"
                  onClick={() => {
                    if (isGuest && guestTicketsUrl) window.location.assign(guestTicketsUrl);
                    else router.push(`/events/${eventId}/tickets`);
                  }}>
                  View tickets
                </ActionButton>
              ) : null}
              <ActionButton type="button" isLoading={isBusy}
                className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
                onClick={openTicketCheckout} disabled={!canBookMore || isBusy}>
                Get tickets
              </ActionButton>
            </div>
          ) : null}
        </div>

        {isAdmin ? (
          <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">
            Admins manage events from the admin event page.
          </p>
        ) : null}
        {notice ? <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}
        {event && !isAdmin && !isLoading && !canBookMore ? (
          <p role="status" className="mb-4 text-sm text-ink-600">{getTicketsLabel}</p>
        ) : null}

        {isLoading ? (
          <MediaDetailSkeleton label="Loading tickets" />
        ) : event ? (
          <div className="grid grid-cols-1 gap-4">
            {view === "details" ? (
              <article className="overflow-hidden rounded-3xl border border-black/5 bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.03)] lg:grid lg:grid-cols-2 lg:items-start">
                <div className="relative bg-surface-muted lg:sticky lg:top-24 lg:m-5 lg:mr-0 lg:overflow-hidden lg:rounded-2xl">
                  <Image
                    src={event.coverImage || FALLBACK_EVENT_IMAGE}
                    alt={`${event.title} full event flier`}
                    width={1200}
                    height={1600}
                    sizes="(min-width: 1440px) 540px, (min-width: 1024px) 38vw, (min-width: 768px) 70vw, 100vw"
                    className="max-h-[75svh] w-full h-auto object-contain"
                  />
                  <ActionButton
                    icon={<Share2 className="size-4" aria-hidden="true" />}
                    className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm backdrop-blur transition hover:bg-surface"
                    type="button"
                    onClick={() => shareEvent()}
                    aria-label={`Share ${event.title}`}
                    title="Share event"
                  >
                  </ActionButton>
                </div>
                <div className="p-4 lg:p-7">
                  <h1 className="text-xl font-semibold lg:text-3xl lg:leading-tight lg:tracking-tight">{event.title}</h1>
                  <p className="mt-2 flex items-start gap-2 text-xs font-medium text-ink-500 lg:mt-4 lg:text-sm lg:leading-6">
                    <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                    <span>{formatEventDateRange(event.startsAt, event.endsAt)}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-ink-600 lg:mt-3 lg:items-start lg:gap-2">
                    <MapPin className="size-4 shrink-0" aria-hidden="true" />
                    {formatEventLocation(event)}
                  </p>
                  {event.category ? (
                    <p className="mt-3 text-xs font-medium text-brand-deep lg:inline-flex lg:rounded-full lg:bg-brand-wash lg:px-3 lg:py-1.5">{event.category}</p>
                  ) : null}
                  {event.description ? (
                    <div className="mt-5 border-t border-black/5 pt-4">
                      <h2 className="text-base font-semibold">About this event</h2>
                      <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-7 text-ink-600 lg:text-base lg:leading-8">{event.description}</p>
                    </div>
                  ) : null}
                  {event.status === "CANCELLED" ? (
                    <p className="mt-4 rounded-2xl bg-danger-tint p-3 text-sm leading-6 text-danger">
                      This event was cancelled. If you paid for a ticket, refunds are being processed and we will contact you by email.
                    </p>
                  ) : null}
                  {event.room ? (
                    <ActionButton
                      trackNavigation isLoading={isRoomBusy} icon={isGuest || event.room.readOnly || event.room.hasJoined ? (
                        <MessageCircle className="size-4" aria-hidden="true" />
                      ) : (
                        <UsersRound className="size-4" aria-hidden="true" />
                      )}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/8 bg-surface px-4 text-sm font-medium text-ink transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => openEventRoom()}
                      disabled={isRoomBusy}
                    >
                      {isGuest || event.room.readOnly ? "View event chat" : event.room.hasJoined ? "Open event chat" : "Join room"}
                    </ActionButton>
                  ) : null}
                </div>
              </article>
            ) : (
              <header>
                <h1 className="text-2xl font-semibold">Your tickets</h1>
                <p className="mt-2 text-lg font-semibold">{event.title}</p>
                <p className="mt-1 text-sm text-ink-600">{formatEventDateRange(event.startsAt, event.endsAt)}</p>
                <p className="mt-1 text-sm text-ink-600">{formatEventLocation(event)}</p>
                {event.status === "CANCELLED" ? (
                  <p className="mt-4 rounded-2xl bg-danger-tint p-3 text-sm leading-6 text-danger">
                    This event was cancelled. These tickets cannot be used for entry.
                  </p>
                ) : null}
              </header>
            )}

            {view === "tickets" && !isGuest ? (
              <div className="grid grid-cols-1 gap-3">
                {tickets.length > 0 ? (
                  <ActionButton type="button" onClick={downloadTickets} icon={<Download className="size-4" aria-hidden="true" />}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/8 bg-surface px-5 text-sm font-medium text-ink">
                    Download tickets
                  </ActionButton>
                ) : null}
                {tickets.length > 0 ? (
                  tickets.map((ticket, index) => {
                    const state = getTicketState(ticket);
                    const Icon = state.icon;

                    return (
                      <article key={ticket.id} className="min-w-0 rounded-3xl border border-black/5 bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                        <TicketQrCode code={ticket.code} available={event.status !== "CANCELLED" && ["PAID", "CONFIRMED"].includes(ticket.status)} />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">Ticket {tickets.length - index}</p>
                            <p className="mt-2 truncate text-lg font-semibold text-ink">{ticket.code}</p>
                            {ticket.ticketType ? (
                              <p className="mt-1 text-sm font-medium text-ink-600">{normalizeTicketTierName(ticket.ticketType.name)}</p>
                            ) : null}
                            <p className="mt-1 text-sm text-ink-600">Booked {formatEventDate(ticket.createdAt)}</p>
                            {ticket.checkedInAt ? (
                              <p className="mt-1 text-sm text-ink-600">Used {formatEventDate(ticket.checkedInAt)}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <ActionButton
                              icon={<Share2 className="size-4" aria-hidden="true" />}
                              className="inline-flex size-9 items-center justify-center rounded-full border border-black/8 text-ink-600 transition hover:border-brand hover:text-ink"
                              type="button"
                              onClick={() => shareEvent(ticket)}
                              aria-label={`Share ${event.title} ticket`}
                              title="Share ticket"
                            >
                            </ActionButton>
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
                      <Ticket className="mx-auto size-8 text-brand" aria-hidden="true" />
                      <h2 className="mt-3 text-2xl font-semibold">No tickets yet</h2>
                      <p className="mt-2 text-sm text-ink-600">Book this event to see your tickets here.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
            <div>
              <Ticket className="mx-auto size-8 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">Event unavailable</h2>
              <p className="mt-2 text-sm text-ink-600">This event could not be loaded.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
