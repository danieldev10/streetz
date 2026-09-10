"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, RefreshCw, Ticket } from "lucide-react";
import { ListSkeleton } from "@/components/skeletons";
import {
  getAdminEventStatusClass,
  getAdminEventStatusLabel,
  getTicketTypeSummary,
  getTotalTicketCapacity,
  isAdminInactiveEvent,
  type AdminEventListMode,
} from "@/features/events/admin-event-model";
import {
  formatEventDate,
  formatEventLocation,
  getEventTicketTypes,
  normalizeEventCategory,
} from "@/features/events/event-display";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { StreetzEvent } from "@/lib/types";

export function AdminEventsList({ token }: { token: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<StreetzEvent[]>([]);
  const [listMode, setListMode] = useState<AdminEventListMode>("active");
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const orderedEvents = useMemo(
    () => [...events].sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
    [events],
  );
  const visibleEvents = useMemo(
    () =>
      orderedEvents.filter((event) =>
        listMode === "inactive" ? isAdminInactiveEvent(event) : !isAdminInactiveEvent(event),
      ),
    [listMode, orderedEvents],
  );

  async function loadEvents() {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await apiRequest<{ events: StreetzEvent[] }>("/admin/events", {
        headers: authHeaders(token),
      });
      setEvents(response.events);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <section>
      <h1 className="sr-only">Event administration</h1>
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            className="hidden h-9 items-center gap-2 rounded-full border border-black/8 px-3 text-sm font-medium md:inline-flex"
            type="button"
            onClick={() => void loadEvents()}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white"
            type="button"
            onClick={() => router.push("/events/create")}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Create Event
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-full border border-black/5 bg-surface-muted p-1 text-sm font-medium md:max-w-sm">
          <button
            type="button"
            className={`rounded-full px-4 py-2 ${
              listMode === "active" ? "bg-ink text-white" : "text-ink-600"
            }`}
            onClick={() => setListMode("active")}
          >
            Active
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 ${
              listMode === "inactive" ? "bg-ink text-white" : "text-ink-600"
            }`}
            onClick={() => setListMode("inactive")}
          >
            Inactive
          </button>
        </div>

        {notice ? (
          <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">
            {notice}
          </p>
        ) : null}

        {isLoading ? (
          <ListSkeleton label="Loading events" hasAvatar={false} />
        ) : visibleEvents.length > 0 ? (
          <div className="grid gap-3">
            {visibleEvents.map((event) => {
              const eventCategory = normalizeEventCategory(event.category);
              const ticketTypes = getEventTicketTypes(event);

              return (
                <article
                  key={event.id}
                  className={`rounded-3xl border p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${
                    isAdminInactiveEvent(event)
                      ? "border-black/[0.03] bg-surface-muted opacity-70"
                      : "border-black/5 bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{event.title}</h2>
                        {eventCategory ? (
                          <span className="rounded-full bg-surface-shade px-2.5 py-1 text-xs font-medium text-ink-600">
                            {eventCategory}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${getAdminEventStatusClass(event)}`}
                        >
                          {getAdminEventStatusLabel(event)}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-sm text-ink-600">
                        <CalendarDays className="size-4" aria-hidden="true" />
                        {formatEventDate(event.startsAt)}
                      </p>
                      <p className="mt-1 text-sm text-ink-600">{formatEventLocation(event)}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-ink-600">
                        <span className="rounded-full bg-surface-muted px-3 py-1">
                          {getTicketTypeSummary(event)}
                        </span>
                        <span className="rounded-full bg-surface-muted px-3 py-1">
                          {event.attendeeCount ??
                            ticketTypes.reduce(
                              (total, ticketType) => total + ticketType.soldCount,
                              0,
                            )}{" "}
                          booked
                        </span>
                        <span className="rounded-full bg-surface-muted px-3 py-1">
                          {event.reservationCount ?? 0} active reservations
                        </span>
                        <span className="rounded-full bg-surface-muted px-3 py-1">
                          {getTotalTicketCapacity(event)} capacity
                        </span>
                      </div>
                    </div>
                    <button
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8"
                      type="button"
                      onClick={() => router.push(`/events/${event.id}/edit`)}
                      aria-label={`Edit ${event.title}`}
                      title="Edit"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
            <div>
              <Ticket className="mx-auto size-8 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">
                {listMode === "inactive" ? "No inactive events" : "No active events"}
              </h2>
              <p className="mt-2 text-sm text-ink-600">
                {listMode === "inactive"
                  ? "Draft, cancelled, or completed events will appear here."
                  : "Create the first paid or free event for members."}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
