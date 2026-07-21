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
import { ScreenHeader } from "@/components/app/navigation";
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
import { MemberEventsList } from "@/features/events/member-events-list";
import { PublicEventsList } from "@/features/events/public-events-list";
import type { GuestTicketBooking } from "@/features/events/ticket-checkout-modal";
import { RafflesList } from "@/features/raffles/raffles-list";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { getCitiesForState, nigeriaStateNames } from "@/lib/nigeria-locations";
import { savePendingEventCheckout } from "@/lib/pending-event-checkout";
import { queryKeys } from "@/lib/query-keys";
import { getAbsoluteAppUrl, shareOrCopyLink } from "@/lib/share";
import type { StreetzEvent, StreetzEventTicketType, StreetzProfile, StreetzRaffle, StreetzUser } from "@/lib/types";

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

type EventViewMode = "tickets" | "events" | "raffles" | "history";

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

export function MemberEventsTab({ token, user, initialEvents, initialRaffles, onAuthRequired }: {
  token?: string | null;
  user?: StreetzUser | null;
  initialEvents?: StreetzEvent[];
  initialRaffles?: StreetzRaffle[];
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
  const initialPublicEventsPendingRef = useRef(initialEvents !== undefined);
  const filterInitializedRef = useRef(false);
  const [eventViewMode, setEventViewMode] = useState<EventViewMode>("events");
  const [eventFilterCategory, setEventFilterCategory] = useState<EventCategoryName | "">("");
  const [eventFilterState, setEventFilterState] = useState("");
  const [eventFilterCity, setEventFilterCity] = useState("");
  const [isEventFilterOpen, setIsEventFilterOpen] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
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
    if (isGuest && initialPublicEventsPendingRef.current) {
      initialPublicEventsPendingRef.current = false;
      return;
    }

    initialPublicEventsPendingRef.current = false;
    const timer = window.setTimeout(async () => {
      setIsLoadingEvents(true);
      setNotice(null);

      try {
        const fetchProfile = !isGuest && !filterInitializedRef.current;
        const requestOptions = isGuest ? undefined : { headers: authHeaders(token as string) };
        const [eventsResult, historyResult, profileResult] = await Promise.all([
          apiRequest<{ events: StreetzEvent[] }>(isGuest ? "/public/events" : "/events", requestOptions),
          isGuest
            ? Promise.resolve({ events: [] as StreetzEvent[] })
            : apiRequest<{ events: StreetzEvent[] }>("/events/history", requestOptions),
          fetchProfile
            ? apiRequest<StreetzProfile | null>("/profiles/me", requestOptions).catch(() => null)
            : Promise.resolve(null),
        ]);

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
        setNotice(getUserErrorMessage(error));
      } finally {
        setIsLoadingEvents(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
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

  const sharedListProps = {
    events: visibleMemberEvents,
    activeEventId,
    emptyTitle: emptyMemberTitle,
    emptyDescription: emptyMemberDescription,
    onOpenCheckout: (event: StreetzEvent) => setTicketModalEventId(event.id),
    onOpenDetails: (event: StreetzEvent) => router.push(`/events/${event.id}`),
    onShare: (event: StreetzEvent) => void shareEvent(event),
  };

  return (
    <section>
      <ScreenHeader
        eyebrow="Events"
        title=""
        action={eventViewMode === "events" ? (
          <button
            className={`relative inline-flex size-10 items-center justify-center rounded-full border text-[#0d0d0d] ${hasEventLocationFilter ? "border-[#bd40be] bg-[#f6e0f6]" : "border-black/8 bg-white"}`}
            type="button"
            onClick={() => setIsEventFilterOpen(true)}
            aria-label="Filter events"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {hasEventLocationFilter ? (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#9d2a9e] text-[9px] font-semibold text-white">
                {[eventFilterState, eventFilterCity].filter(Boolean).length}
              </span>
            ) : null}
          </button>
        ) : undefined}
      />

      {isEventFilterOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-4 backdrop-blur-sm sm:p-5">
          <button className="absolute inset-0" type="button" onClick={() => setIsEventFilterOpen(false)} aria-label="Close filters" />
          <div className="relative w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]" role="dialog" aria-modal="true" aria-label="Event filters">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Filters</p>
                <h2 className="mt-1 text-xl font-semibold text-[#0d0d0d]">Location</h2>
              </div>
              <button className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]" type="button" onClick={() => setIsEventFilterOpen(false)} aria-label="Close filters">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                State
                <select
                  className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
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
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                City
                <select
                  className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be] disabled:bg-[#fafafa] disabled:text-[#999999]"
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
                className="inline-flex h-12 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => {
                  setEventFilterState("");
                  setEventFilterCity("");
                }}
                disabled={!hasEventLocationFilter}
              >
                Clear
              </button>
              <button className="inline-flex h-12 items-center justify-center rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white" type="button" onClick={() => setIsEventFilterOpen(false)}>
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
          onSubmit={(ticketType, quantity) => void bookEvent(ticketModalEvent, ticketType, quantity)}
          onGuestBooked={applyGuestBooking}
        />
      ) : null}

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className={`mb-4 grid rounded-full border border-black/5 bg-[#fafafa] p-1 text-sm font-medium ${isGuest ? "grid-cols-2 md:max-w-xs" : "grid-cols-4 md:max-w-md"}`}>
          <button type="button" className={`rounded-full px-3 py-2 ${eventViewMode === "events" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`} onClick={() => setEventViewMode("events")}>Events</button>
          <button type="button" className={`rounded-full px-3 py-2 ${eventViewMode === "raffles" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`} onClick={() => setEventViewMode("raffles")}>Raffles</button>
          {!isGuest ? <button type="button" className={`rounded-full px-3 py-2 ${eventViewMode === "tickets" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`} onClick={() => setEventViewMode("tickets")}>Tickets</button> : null}
          {!isGuest ? <button type="button" className={`rounded-full px-3 py-2 ${eventViewMode === "history" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`} onClick={() => setEventViewMode("history")}>History</button> : null}
        </div>

        {eventViewMode === "raffles" ? (
          <RafflesList token={token ?? null} initialRaffles={initialRaffles} />
        ) : (
          <>
            <div className="-mx-5 mb-4 overflow-x-auto px-5 pb-1 md:-mx-8 md:px-8">
              <div className="flex min-w-max gap-5">
                <button
                  type="button"
                  className={`grid w-[5.5rem] shrink-0 justify-items-center gap-2 text-center text-xs font-medium ${eventFilterCategory ? "text-[#666666]" : "text-[#0d0d0d]"}`}
                  onClick={() => setEventFilterCategory("")}
                  aria-pressed={!eventFilterCategory}
                >
                  <span className={`grid size-14 place-items-center rounded-full border ${eventFilterCategory ? "border-black/8 bg-white" : "border-[#bd40be] bg-[#f6e0f6]"}`}>
                    <Sparkles className="size-5" aria-hidden="true" />
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
                      className={`grid w-[5.5rem] shrink-0 justify-items-center gap-2 text-center text-xs font-medium ${isActiveCategory ? "text-[#0d0d0d]" : "text-[#666666]"} ${hasCategoryEvents ? "" : "opacity-55"}`}
                      onClick={() => setEventFilterCategory(category)}
                      aria-pressed={isActiveCategory}
                    >
                      <span className={`grid size-14 place-items-center rounded-full border ${isActiveCategory ? "border-[#bd40be] bg-[#f6e0f6]" : "border-black/8 bg-white"}`}>
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="leading-tight">{category}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {notice ? <p className="mb-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

            {isLoadingEvents ? (
              <CardGridSkeleton label="Loading events" />
            ) : isGuest ? (
              <PublicEventsList {...sharedListProps} />
            ) : eventViewMode === "history" ? (
              <EventHistory {...sharedListProps} />
            ) : (
              <MemberEventsList {...sharedListProps} mode={eventViewMode === "tickets" ? "tickets" : "explore"} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
