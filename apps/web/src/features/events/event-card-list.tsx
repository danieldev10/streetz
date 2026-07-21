"use client";

import Image from "next/image";
import { CalendarDays, LoaderCircle, MapPin, Share2, Ticket } from "lucide-react";
import {
  FALLBACK_EVENT_IMAGE,
  formatEventDate,
  formatEventLocation,
  formatPrice,
  getEventTicketTypes,
  getHistoryAttendanceClass,
  getHistoryAttendanceLabel,
  getMaxPurchaseQuantity,
  getOwnedTicketTypeIds,
  getSelectedTicketType,
  isMemberBookableEvent,
  normalizeTicketTierName,
} from "@/features/events/event-display";
import type { StreetzEvent } from "@/lib/types";

export type EventCardMode = "explore" | "tickets" | "history";

export function EventCardList({ events, mode, activeEventId, emptyTitle, emptyDescription, onOpenCheckout, onOpenDetails, onShare }: {
  events: StreetzEvent[];
  mode: EventCardMode;
  activeEventId: string | null;
  emptyTitle: string;
  emptyDescription: string;
  onOpenCheckout: (event: StreetzEvent) => void;
  onOpenDetails: (event: StreetzEvent) => void;
  onShare: (event: StreetzEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
        <div>
          <Ticket className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-semibold">{emptyTitle}</h2>
          <p className="mt-2 text-sm text-[#666666]">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  const isOwnedEventCard = mode !== "explore";
  const isHistoryCard = mode === "history";

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {events.map((event) => {
        const ticketTypes = getEventTicketTypes(event);
        const ticketType = getSelectedTicketType(event);
        const ownedTicketTypeIds = getOwnedTicketTypeIds(event);
        const maxPurchaseQuantity = getMaxPurchaseQuantity(event, ticketType);
        const canBookMore = maxPurchaseQuantity > 0;
        const isSoldOut = Boolean(ticketType && ticketType.availableCount <= 0);
        const isLimitReached = Boolean(
          ticketType && isMemberBookableEvent(event) && !isSoldOut && maxPurchaseQuantity <= 0
        );
        const isBusy = activeEventId === event.id;
        const getTicketsLabel = isSoldOut
          ? "Sold out"
          : isLimitReached
            ? "Ticket limit reached"
            : !isMemberBookableEvent(event)
              ? "Event unavailable"
              : "Get Tickets";

        function openDetailsFromKeyboard(key: string) {
          if (isOwnedEventCard && (key === "Enter" || key === " ")) {
            onOpenDetails(event);
          }
        }

        return (
          <article
            key={event.id}
            className={`overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${isOwnedEventCard ? "cursor-pointer transition hover:border-[#bd40be]/30 hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)]" : ""}`}
            role={isOwnedEventCard ? "button" : undefined}
            tabIndex={isOwnedEventCard ? 0 : undefined}
            onClick={isOwnedEventCard ? () => onOpenDetails(event) : undefined}
            onKeyDown={isOwnedEventCard ? (keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
              }
              openDetailsFromKeyboard(keyboardEvent.key);
            } : undefined}
          >
            <div className="relative h-44 bg-[#f6e0f6] md:h-48">
              <Image
                src={event.coverImage || FALLBACK_EVENT_IMAGE}
                alt={`${event.title} event`}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover"
              />
              <button
                className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-white/90 text-[#0d0d0d] shadow-sm backdrop-blur transition hover:bg-white"
                type="button"
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  onShare(event);
                }}
                aria-label={`Share ${event.title}`}
                title="Share event"
              >
                <Share2 className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-4">
              <h2 className="text-lg font-semibold leading-snug">{event.title}</h2>
              <p className="mt-2 flex items-start gap-1.5 text-sm leading-5 text-[#666666]">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{formatEventLocation(event)}</span>
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                <CalendarDays className="size-4" aria-hidden="true" />
                {formatEventDate(event.startsAt)}
              </p>
              {isOwnedEventCard && ticketTypes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {isHistoryCard ? (
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${getHistoryAttendanceClass(event)}`}>
                      {getHistoryAttendanceLabel(event)}
                    </span>
                  ) : null}
                  {ticketTypes.map((availableTicketType) => {
                    const isOwnedTier = ownedTicketTypeIds.has(availableTicketType.id);

                    return (
                      <span
                        key={availableTicketType.id}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          isOwnedTier ? "bg-[#f6e0f6] text-[#7c1f7d]" : "bg-[#fafafa] text-[#666666]"
                        }`}
                      >
                        {normalizeTicketTierName(availableTicketType.name)} · {formatPrice(availableTicketType.priceKobo)}
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <button
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={!isOwnedEventCard && (!ticketType || !canBookMore || isBusy)}
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  if (isOwnedEventCard) {
                    onOpenDetails(event);
                    return;
                  }

                  onOpenCheckout(event);
                }}
              >
                {isBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                {isHistoryCard ? "View details" : mode === "tickets" ? "View tickets" : getTicketsLabel}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
