"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Drama,
  Dumbbell,
  Gamepad2,
  Heart,
  Laptop,
  Moon,
  Music,
  PartyPopper,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AuthPromptKind } from "@/components/app/public-route";
import { useToast } from "@/components/app/toast-provider";
import { CardGridSkeleton } from "@/components/card-grid-skeleton";
import {
  EVENT_CATEGORY_OPTIONS,
  MAX_TICKETS_PER_PURCHASE,
  type EventCategoryName,
  getMaxPurchaseQuantity,
  hasConfirmedTicket,
  isMemberBookableEvent,
  normalizeEventCategory,
} from "@/features/events/event-display";
import { EventHistory } from "@/features/events/event-history";
import { EventCategorySlider } from "@/features/events/event-category-slider";
import { MemberEventsList } from "@/features/events/member-events-list";
import { PublicEventsList } from "@/features/events/public-events-list";
import type { GuestTicketBooking } from "@/features/events/ticket-checkout-modal";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { getCitiesForState, nigeriaStateNames } from "@/lib/nigeria-locations";
import { savePendingEventCheckout } from "@/lib/pending-event-checkout";
import { queryKeys } from "@/lib/query-keys";
import { getAbsoluteAppUrl, shareOrCopyLink } from "@/lib/share";
import type { StreetzEvent, StreetzEventTicketType, StreetzProfile, StreetzUser } from "@/lib/types";

const TicketCheckoutModal = dynamic(() =>
  import("@/features/events/ticket-checkout-modal").then((module) => module.TicketCheckoutModal)
);

const eventCategoryIcons: Record<EventCategoryName, LucideIcon> = {
  Music,
  Nightlife: Moon,
  Theatre: Drama,
  Holidays: PartyPopper,
  Dating: Heart,
  Hobbies: Gamepad2,
  Business: Briefcase,
  "Food & Drink": Utensils,
  "Sports & Fitness": Dumbbell,
  Fashion: Shirt,
  Tech: Laptop,
  Community: UsersRound,
};

type EventViewMode = "tickets" | "events" | "history";

function findEventStateForCity(city: string) {
  const normalizedCity = city.trim().toLowerCase();

  if (!normalizedCity) {
    return null;
  }

  return nigeriaStateNames.find((state) =>
    getCitiesForState(state).some((candidate) => candidate.toLowerCase() === normalizedCity)
  ) ?? null;
}

function getEventState(event: Pick<StreetzEvent, "city" | "state">) {
  return event.state ?? findEventStateForCity(event.city) ?? "";
}

export function MemberEventsTab({ token, user, initialEvents, onAuthRequired }: {
  token?: string | null;
  user?: StreetzUser | null;
  initialEvents?: StreetzEvent[];
  onAuthRequired?: (kind?: AuthPromptKind) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isGuest = !token || !user;
  const eventCacheScope = isGuest ? "public" : "member";
  const cachedInitialEvents = initialEvents ?? queryClient.getQueryData<StreetzEvent[]>(queryKeys.events(eventCacheScope));
  const [events, setEvents] = useState<StreetzEvent[]>(() => cachedInitialEvents ?? []);
  const [historyEvents, setHistoryEvents] = useState<StreetzEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(cachedInitialEvents === undefined);
  const filterInitializedRef = useRef(false);
  const [eventViewMode, setEventViewMode] = useState<EventViewMode>("events");
  const [eventFilterCategory, setEventFilterCategory] = useState<EventCategoryName | "">("");
  const [eventFilterState, setEventFilterState] = useState("");
  const [eventFilterCity, setEventFilterCity] = useState("");
  const [isEventFilterOpen, setIsEventFilterOpen] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeRoomEventId, setActiveRoomEventId] = useState<string | null>(null);
  const [ticketModalEventId, setTicketModalEventId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orderedEvents = useMemo(
    () => [...events].sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
    [events]
  );
  const orderedHistoryEvents = useMemo(
    () => [...historyEvents].sort((first, second) => Date.parse(second.startsAt) - Date.parse(first.startsAt)),
    [historyEvents]
  );
  const ticketEvents = useMemo(() => orderedEvents.filter(hasConfirmedTicket), [orderedEvents]);
  const exploreEvents = useMemo(
    () => orderedEvents.filter((event) => isMemberBookableEvent(event) && !hasConfirmedTicket(event)),
    [orderedEvents]
  );
  const memberEventsForMode = useMemo(
    () => isGuest
      ? exploreEvents
      : eventViewMode === "tickets"
        ? ticketEvents
        : eventViewMode === "history"
          ? orderedHistoryEvents
          : exploreEvents,
    [eventViewMode, exploreEvents, isGuest, orderedHistoryEvents, ticketEvents]
  );
  const memberCategoryOptions = useMemo(() => {
    const availableCategories = new Set(
      memberEventsForMode
        .map((event) => normalizeEventCategory(event.category))
        .filter((category): category is EventCategoryName => Boolean(category))
    );

    return EVENT_CATEGORY_OPTIONS.filter((category) => availableCategories.has(category));
  }, [memberEventsForMode]);
  const eventFilterCityOptions = useMemo(() => {
    if (!eventFilterState) {
      return [];
    }

    const cityOptions = new Set(getCitiesForState(eventFilterState));

    memberEventsForMode.forEach((event) => {
      if (getEventState(event) === eventFilterState) {
        cityOptions.add(event.city);
      }
    });

    return [...cityOptions];
  }, [eventFilterState, memberEventsForMode]);
  const visibleMemberEvents = useMemo(() => memberEventsForMode.filter((event) => {
    if (eventFilterCategory && normalizeEventCategory(event.category) !== eventFilterCategory) {
      return false;
    }

    if (eventViewMode === "events" && eventFilterState && getEventState(event) !== eventFilterState) {
      return false;
    }

    return !(eventViewMode === "events" && eventFilterCity && event.city !== eventFilterCity);
  }), [eventFilterCategory, eventFilterCity, eventFilterState, eventViewMode, memberEventsForMode]);
  const ticketModalEvent = useMemo(
    () => events.find((event) => event.id === ticketModalEventId) ?? null,
    [events, ticketModalEventId]
  );
  const hasEventLocationFilter = Boolean(eventFilterState || eventFilterCity);
  const hasEventCategoryFilter = Boolean(eventFilterCategory);
  const hasMemberFilter = hasEventCategoryFilter || (eventViewMode === "events" && hasEventLocationFilter);
  const emptyMemberTitle = !isGuest && eventViewMode === "tickets"
    ? hasEventCategoryFilter ? "No tickets found" : "No tickets yet"
    : !isGuest && eventViewMode === "history"
      ? hasEventCategoryFilter ? "No history found" : "No event history"
      : hasMemberFilter ? "No events found" : "No events yet";
  const emptyMemberDescription = !isGuest && eventViewMode === "tickets"
    ? hasEventCategoryFilter ? "Try another category." : "Tickets you book or buy will appear here."
    : !isGuest && eventViewMode === "history"
      ? hasEventCategoryFilter ? "Try another category." : "Past ticketed events will appear here."
      : hasMemberFilter ? "Try another category, state, or city." : "Events you have not booked yet will appear here.";

  useEffect(() => {
    if (initialEvents !== undefined) {
      queryClient.setQueryData(queryKeys.events("public"), initialEvents);
    }
  }, [initialEvents, queryClient]);

  useEffect(() => {
    if (initialEvents !== undefined || events.length > 0) {
      queryClient.setQueryData(queryKeys.events(eventCacheScope), events);
    }
  }, [eventCacheScope, events, initialEvents, queryClient]);

  useEffect(() => {
    let cancelled = false;
    let pending = false;
    let lastRefreshAt = 0;

    async function refreshEvents() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      lastRefreshAt = Date.now();

      try {
        const fetchProfile = !isGuest && !filterInitializedRef.current;
        const requestOptions: RequestInit = { cache: "no-store", ...(!isGuest ? { headers: authHeaders(token as string) } : {}) };
        const [eventsResult, historyResult, profileResult] = await Promise.all([
          apiRequest<{ events: StreetzEvent[] }>(isGuest ? "/public/events" : "/events", requestOptions),
          isGuest
            ? Promise.resolve({ events: [] as StreetzEvent[] })
            : apiRequest<{ events: StreetzEvent[] }>("/events/history", requestOptions),
          fetchProfile
            ? apiRequest<StreetzProfile | null>("/profiles/me", requestOptions).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;
        setEvents(eventsResult.events);
        setHistoryEvents(historyResult.events);
        queryClient.setQueryData(queryKeys.events(eventCacheScope), eventsResult.events);

        if (!filterInitializedRef.current) {
          filterInitializedRef.current = true;
          if (profileResult?.state) {
            setEventFilterState(profileResult.state);
          }
        }
      } catch (error) {
        if (!cancelled) setNotice(getUserErrorMessage(error));
      } finally {
        pending = false;
        if (!cancelled) setIsLoadingEvents(false);
      }
    }

    // Recheck even when SSR or local storage supplied a list. Cancelled events
    // must not survive indefinitely in an open guest tab or browser history.
    const timer = window.setTimeout(() => void refreshEvents(), 0);
    const interval = window.setInterval(() => void refreshEvents(), 60_000);
    function refreshOnReturn() {
      if (Date.now() - lastRefreshAt > 5_000) void refreshEvents();
    }
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [eventCacheScope, isGuest, queryClient, token]);

  useEffect(() => {
    if (!isEventFilterOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsEventFilterOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEventFilterOpen]);

  async function openTicketCheckout(event: StreetzEvent) {
    setNotice(null);
    try {
      await import("@/features/events/ticket-checkout-modal");
      setTicketModalEventId(event.id);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    }
  }

  async function shareEvent(event: StreetzEvent) {
    try {
      const result = await shareOrCopyLink({
        title: event.title,
        text: `Check out ${event.title} on Crushclub.`,
        url: getAbsoluteAppUrl(`/events/${event.id}`),
      });

      if (result === "copied") {
        showToast("Event link copied.");
      }
    } catch {
      showToast("Could not copy event link right now.", { tone: "error" });
    }
  }

  async function bookEvent(event: StreetzEvent, ticketType: StreetzEventTicketType | null, quantity = 1) {
    if (!ticketType || !isMemberBookableEvent(event) || ticketType.availableCount <= 0) {
      return;
    }

    const maxQuantity = isGuest
      ? Math.min(ticketType.availableCount, MAX_TICKETS_PER_PURCHASE)
      : getMaxPurchaseQuantity(event, ticketType);
    const safeQuantity = Math.max(1, Math.min(quantity, maxQuantity));

    if (safeQuantity < 1) {
      return;
    }

    if (isGuest) {
      savePendingEventCheckout({ eventId: event.id, ticketTypeId: ticketType.id, quantity: safeQuantity });
      setTicketModalEventId(null);
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
          headers: authHeaders(token),
          body: JSON.stringify({ quantity: safeQuantity, ticketTypeId: ticketType.id }),
        });
        setEvents((current) => current.map((item) => item.id === updatedEvent.id ? updatedEvent : item));
        setTicketModalEventId(null);
        setNotice(safeQuantity === 1 ? "Spot booked." : `${safeQuantity} spots booked.`);
        return;
      }

      const response = await apiRequest<{ authorizationUrl?: string }>(`/payments/events/${event.id}/ticket/initialize`, {
        method: "POST",
        headers: authHeaders(token),
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
    const bookedCount = booking.tickets.length;
    setEvents((current) => current.map((event) => {
      if (event.id !== booking.event.id) {
        return event;
      }

      const updateTicketType = (ticketType: StreetzEventTicketType) => ticketType.id === booking.ticketType.id
        ? {
            ...ticketType,
            soldCount: ticketType.soldCount + bookedCount,
            availableCount: Math.max(0, ticketType.availableCount - bookedCount)
          }
        : ticketType;

      return {
        ...event,
        ticketTypes: event.ticketTypes.map(updateTicketType),
        ticketType: event.ticketType ? updateTicketType(event.ticketType) : null
      };
    }));
  }

  async function openEventRoom(event: StreetzEvent) {
    if (!event.room) {
      return;
    }

    if (isGuest || event.room.readOnly || !token) {
      router.push(`/rooms/${event.room.id}`);
      return;
    }

    setActiveRoomEventId(event.id);
    setNotice(null);

    try {
      if (!event.room.hasJoined) {
        await apiRequest(`/rooms/${event.room.id}/join`, {
          method: "POST",
          headers: authHeaders(token),
        });

        const markRoomJoined = (candidate: StreetzEvent) => candidate.id === event.id && candidate.room
          ? { ...candidate, room: { ...candidate.room, hasJoined: true } }
          : candidate;

        setEvents((current) => current.map(markRoomJoined));
        setHistoryEvents((current) => current.map(markRoomJoined));
      }

      router.push(`/rooms/${event.room.id}`);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setActiveRoomEventId(null);
    }
  }

  const sharedListProps = {
    events: visibleMemberEvents,
    isGuest,
    activeEventId,
    activeRoomEventId,
    emptyTitle: emptyMemberTitle,
    emptyDescription: emptyMemberDescription,
    onOpenCheckout: openTicketCheckout,
    onOpenDetails: (event: StreetzEvent) => router.push(`/events/${event.id}${eventViewMode === "tickets" ? "/tickets" : ""}`),
    onOpenRoom: openEventRoom,
    onShare: shareEvent,
  };

  return (
    <section>
      {isEventFilterOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-4 backdrop-blur-sm sm:p-5">
          <button className="absolute inset-0" type="button" onClick={() => setIsEventFilterOpen(false)} aria-label="Close filters" />
          <div className="relative w-full max-w-sm rounded-[28px] bg-surface p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]" role="dialog" aria-modal="true" aria-label="Event filters">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-400">Filters</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">Location</h2>
              </div>
              <button className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 text-ink" type="button" onClick={() => setIsEventFilterOpen(false)} aria-label="Close filters">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
                State
                <select
                  className="h-12 rounded-full border border-black/8 bg-surface px-4 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  value={eventFilterState}
                  onChange={(inputEvent) => {
                    setEventFilterState(inputEvent.target.value);
                    setEventFilterCity("");
                  }}
                >
                  <option value="">All states</option>
                  {nigeriaStateNames.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
                City
                <select
                  className="h-12 rounded-full border border-black/8 bg-surface px-4 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-surface-muted disabled:text-ink-300"
                  value={eventFilterCity}
                  onChange={(inputEvent) => setEventFilterCity(inputEvent.target.value)}
                  disabled={!eventFilterState}
                >
                  <option value="">{eventFilterState ? "All cities" : "Choose state first"}</option>
                  {eventFilterCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-12 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-ink-600 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => {
                  setEventFilterState("");
                  setEventFilterCity("");
                }}
                disabled={!hasEventLocationFilter}
              >
                Clear
              </button>
              <button className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-white" type="button" onClick={() => setIsEventFilterOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ticketModalEvent ? (
        <TicketCheckoutModal
          event={ticketModalEvent}
          isGuest={isGuest}
          isBusy={activeEventId === ticketModalEvent.id}
          onClose={() => setTicketModalEventId(null)}
          onSubmit={(ticketType, quantity) => bookEvent(ticketModalEvent, ticketType, quantity)}
          onGuestBooked={applyGuestBooking}
        />
      ) : null}

      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <h1 className="sr-only">
          {eventViewMode === "tickets" ? "Your tickets" : eventViewMode === "history" ? "Event history" : "Events"}
        </h1>
        <div className="mb-4 flex items-center gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)_minmax(0,1fr)]">
          {!isGuest ? (
            <div className="grid flex-1 grid-cols-3 rounded-full border border-black/5 bg-surface-muted p-1 text-sm font-medium md:col-start-2" role="group" aria-label="Event views">
              <button type="button" className={`rounded-full px-3 py-2 ${eventViewMode === "events" ? "bg-ink text-white" : "text-ink-600"}`} onClick={() => setEventViewMode("events")}>Events</button>
              <button type="button" className={`rounded-full px-3 py-2 ${eventViewMode === "tickets" ? "bg-ink text-white" : "text-ink-600"}`} onClick={() => setEventViewMode("tickets")}>Tickets</button>
              <button type="button" className={`rounded-full px-3 py-2 ${eventViewMode === "history" ? "bg-ink text-white" : "text-ink-600"}`} onClick={() => setEventViewMode("history")}>History</button>
            </div>
          ) : null}
          <div className="ml-auto flex min-w-0 items-center justify-end gap-2 md:col-start-3 md:ml-0">
            {!isLoadingEvents ? <span className="hidden shrink-0 text-xs font-medium text-ink-500 md:inline" role="status">{visibleMemberEvents.length} {visibleMemberEvents.length === 1 ? "event" : "events"}</span> : null}
            {eventViewMode === "events" ? (
              <button
                className={`relative inline-flex size-10 items-center justify-center rounded-full border text-ink lg:w-auto lg:min-w-0 lg:max-w-40 lg:gap-2 lg:px-4 ${hasEventLocationFilter ? "border-brand bg-brand-tint" : "border-black/8 bg-surface"}`}
                type="button"
                onClick={() => setIsEventFilterOpen(true)}
                aria-label="Filter events"
              >
                <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
                <span className="hidden truncate text-sm font-medium lg:inline">{eventFilterCity || eventFilterState || "Location"}</span>
                {hasEventLocationFilter ? (
                  <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-brand-strong text-[9px] font-semibold text-white">
                    {[eventFilterState, eventFilterCity].filter(Boolean).length}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>

        <EventCategorySlider>
          <button
            type="button"
            className={`grid w-[5.5rem] shrink-0 justify-items-center gap-2 text-center text-xs font-medium md:flex md:w-auto md:items-center md:rounded-full md:border md:px-3 md:py-2 ${eventFilterCategory ? "text-ink-600 md:border-black/8 md:bg-surface" : "text-ink md:border-brand/30 md:bg-brand-tint"}`}
            onClick={() => setEventFilterCategory("")}
            aria-pressed={!eventFilterCategory}
          >
            <span className={`grid size-14 place-items-center rounded-full border md:size-5 md:border-0 md:bg-transparent! ${eventFilterCategory ? "border-black/8 bg-surface" : "border-brand bg-brand-tint"}`}>
              <Sparkles className="size-5 md:size-4" aria-hidden="true" />
            </span>
            All
          </button>
          {EVENT_CATEGORY_OPTIONS.map((category) => {
            const Icon = eventCategoryIcons[category];
            const isActiveCategory = eventFilterCategory === category;
            const hasCategoryEvents = memberCategoryOptions.includes(category);

            return (
              <button
                key={category}
                type="button"
                className={`grid w-[5.5rem] shrink-0 justify-items-center gap-2 text-center text-xs font-medium md:flex md:w-auto md:items-center md:rounded-full md:border md:px-3 md:py-2 ${isActiveCategory ? "text-ink md:border-brand/30 md:bg-brand-tint" : "text-ink-600 md:border-black/8 md:bg-surface"} ${hasCategoryEvents ? "" : "opacity-55"}`}
                onClick={() => setEventFilterCategory(category)}
                aria-pressed={isActiveCategory}
              >
                <span className={`grid size-14 place-items-center rounded-full border md:size-5 md:border-0 md:bg-transparent! ${isActiveCategory ? "border-brand bg-brand-tint" : "border-black/8 bg-surface"}`}>
                  <Icon className="size-5 md:size-4" aria-hidden="true" />
                </span>
                <span className="leading-tight md:whitespace-nowrap">{category}</span>
              </button>
            );
          })}
        </EventCategorySlider>

        {notice ? <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {isLoadingEvents ? (
          <CardGridSkeleton label="Loading events" hasTicketChips={eventViewMode !== "events"} />
        ) : isGuest ? (
          <PublicEventsList {...sharedListProps} />
        ) : eventViewMode === "history" ? (
          <EventHistory {...sharedListProps} />
        ) : (
          <MemberEventsList {...sharedListProps} mode={eventViewMode === "tickets" ? "tickets" : "explore"} />
        )}
      </div>
    </section>
  );
}
