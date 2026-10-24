"use client";

import { ActionButton } from "@/components/action-button";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, MessageCircle, Share2, Ticket, UsersRound } from "lucide-react";
import {
  FALLBACK_EVENT_IMAGE,
  formatEventDate,
  formatEventDateRange,
  formatEventLocation,
  formatPrice,
  getEventTicketAvailability,
  getEventTicketTypes,
  getHistoryAttendanceClass,
  getHistoryAttendanceLabel,
  getOwnedTicketCount,
  getOwnedTicketTypeIds,
  isMemberBookableEvent,
  normalizeTicketTierName,
} from "@/features/events/event-display";
import type { StreetzEvent } from "@/lib/types";

type EventCardMode = "explore" | "history";

export function EventCardList({ events, mode, isGuest, activeEventId, activeRoomEventId, emptyTitle, emptyDescription, onOpenCheckout, onOpenDetails, onOpenTickets, onOpenRoom, onShare }: {
  events: StreetzEvent[];
  mode: EventCardMode;
  isGuest: boolean;
  activeEventId: string | null;
  activeRoomEventId: string | null;
  emptyTitle: string;
  emptyDescription: string;
  onOpenCheckout: (event: StreetzEvent) => void | Promise<void>;
  onOpenDetails: (event: StreetzEvent) => void;
  onOpenTickets: (event: StreetzEvent) => void;
  onOpenRoom: (event: StreetzEvent) => void | Promise<void>;
  onShare: (event: StreetzEvent) => void | Promise<void>;
}) {
  if (events.length === 0) {
    return (
      <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
        <div>
          <Ticket className="mx-auto size-8 text-brand" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-semibold">{emptyTitle}</h2>
          <p className="mt-2 text-sm text-ink-600">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  const isHistoryCard = mode === "history";

  return (
    <div className="grid gap-4 md:gap-5 min-[960px]:grid-cols-2 min-[1360px]:grid-cols-3">
      {events.map((event) => {
        const ticketTypes = getEventTicketTypes(event);
        const ownedTicketTypeIds = getOwnedTicketTypeIds(event);
        const ownedTicketCount = isGuest ? 0 : getOwnedTicketCount(event);
        const hasTickets = ownedTicketCount > 0;
        const compactChat = !isGuest && (hasTickets || event.room?.hasJoined);
        const { canBookMore, isSoldOut, isLimitReached } = getEventTicketAvailability(event, isGuest);
        const isBusy = activeEventId === event.id;
        const isRoomBusy = activeRoomEventId === event.id;
        const getTicketsLabel = !ticketTypes.length
          ? "No tickets available"
          : isSoldOut
          ? "Sold out"
          : isLimitReached
            ? "Ticket limit reached"
            : !isMemberBookableEvent(event)
              ? "Event unavailable"
              : "Get Tickets";

        return (
          <article
            key={event.id}
            className="relative isolate overflow-hidden rounded-3xl border border-black/5 bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-brand/30 hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)] md:flex md:flex-col"
          >
            <Link href={`/events/${event.id}`} aria-label={`View details for ${event.title}`}
              className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand" />
            <div className="relative h-44 shrink-0 bg-brand-tint md:h-52">
              <Image
                src={event.coverImage || FALLBACK_EVENT_IMAGE}
                alt={`${event.title} event`}
                fill
                sizes="(min-width: 1440px) 360px, (min-width: 1360px) 26vw, (min-width: 960px) 38vw, (min-width: 768px) 65vw, 100vw"
                className="object-cover"
              />
              {event.category ? <span className="absolute left-3 top-3 hidden rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-brand-deep shadow-sm backdrop-blur md:inline-flex">{event.category}</span> : null}
              <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
                <ActionButton
                  icon={<Share2 className="size-4" aria-hidden="true" />}
                  className="inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm backdrop-blur transition hover:bg-surface"
                  type="button"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    return onShare(event);
                  }}
                  aria-label={`Share ${event.title}`}
                  title="Share event"
                />
                {hasTickets ? (
                  <ActionButton
                    trackNavigation
                    icon={<Ticket className="size-4 shrink-0" aria-hidden="true" />}
                    className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full bg-brand-tint px-3 text-sm font-semibold text-brand-deep shadow-sm transition hover:bg-surface"
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onOpenTickets(event);
                    }}
                    aria-label={`View your ${ownedTicketCount} ${ownedTicketCount === 1 ? "ticket" : "tickets"} for ${event.title}`}
                    title={`${ownedTicketCount} ${ownedTicketCount === 1 ? "ticket" : "tickets"} booked`}
                  >
                    {ownedTicketCount}
                  </ActionButton>
                ) : null}
              </div>
            </div>
            <div className="p-4 md:flex md:flex-1 md:flex-col md:p-5">
              <h2 className="text-lg font-semibold leading-snug">{event.title}</h2>
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-deep">
                View full details <ChevronRight className="size-3.5" aria-hidden="true" />
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-sm leading-5 text-ink-600">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{formatEventLocation(event)}</span>
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400 md:font-medium md:normal-case md:leading-5 md:tracking-normal">
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                <span className="md:hidden">{formatEventDate(event.startsAt)}</span>
                <span className="hidden md:inline">{formatEventDateRange(event.startsAt, event.endsAt)}</span>
              </p>
              {isHistoryCard && ticketTypes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${getHistoryAttendanceClass(event)}`}>
                    {getHistoryAttendanceLabel(event)}
                  </span>
                  {ticketTypes.map((availableTicketType) => {
                    const isOwnedTier = ownedTicketTypeIds.has(availableTicketType.id);

                    return (
                      <span
                        key={availableTicketType.id}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          isOwnedTier ? "bg-brand-tint text-brand-deep" : "bg-surface-muted text-ink-600"
                        }`}
                      >
                        {normalizeTicketTierName(availableTicketType.name)} · {formatPrice(availableTicketType.priceKobo)}
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <div className="relative z-20 mt-4 flex gap-2 md:mt-auto md:pt-5">
                <ActionButton
                  trackNavigation={isHistoryCard} isLoading={isBusy} icon={!hasTickets ? <Ticket className="size-4 shrink-0" aria-hidden="true" /> : undefined}
                  className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${hasTickets ? "px-3 text-xs" : "px-4 text-sm"}`}
                  type="button"
                  disabled={!isHistoryCard && (!canBookMore || isBusy)}
                  title={isHistoryCard ? "View details" : getTicketsLabel}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    if (isHistoryCard) {
                      return onOpenDetails(event);
                    }

                    return onOpenCheckout(event);
                  }}
                >
                  <span className="truncate">{isHistoryCard ? "View details" : getTicketsLabel}</span>
                </ActionButton>
                {hasTickets ? (
                  <ActionButton
                    trackNavigation
                    className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-full border border-black/8 bg-surface px-3 text-xs font-medium text-ink transition hover:border-brand"
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onOpenTickets(event);
                    }}
                  >
                    View Tickets
                  </ActionButton>
                ) : null}
                {event.room ? (
                  <ActionButton
                    trackNavigation isLoading={isRoomBusy} icon={isGuest || event.room.readOnly || compactChat ? (
                      <MessageCircle className="size-4" aria-hidden="true" />
                    ) : (
                      <UsersRound className="size-4" aria-hidden="true" />
                    )}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/8 bg-surface text-sm font-medium text-ink transition hover:border-brand ${compactChat ? "w-11 shrink-0" : "min-w-0 flex-1 px-4"}`}
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      return onOpenRoom(event);
                    }}
                    disabled={isRoomBusy}
                    aria-label={compactChat ? `Open ${event.title} chat` : undefined}
                    title={compactChat ? "Open event chat" : undefined}
                  >
                    {compactChat ? (
                      <span className="sr-only">Open event chat</span>
                    ) : isGuest || event.room.readOnly ? (
                      <span>View chat</span>
                    ) : (
                      <span>Join room</span>
                    )}
                  </ActionButton>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
