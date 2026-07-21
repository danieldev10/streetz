"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Ticket, X } from "lucide-react";
import type { StreetzEvent, StreetzEventTicketType, TicketStatus } from "@/lib/types";

const MAX_TICKETS_PER_PURCHASE = 20;
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["PAID", "CHECKED_IN"]);
const EVENT_TICKET_TIER_NAMES = ["Regular", "VIP", "Tables"] as const;

function normalizeTicketTierName(name: string) {
  if (name === "General Admission") return "Regular";
  return (EVENT_TICKET_TIER_NAMES as readonly string[]).includes(name) ? name : "Regular";
}

function getTicketTypes(event: StreetzEvent) {
  const ticketTypes = event.ticketTypes?.length ? event.ticketTypes : event.ticketType ? [event.ticketType] : [];
  return [...ticketTypes].sort((first, second) =>
    EVENT_TICKET_TIER_NAMES.indexOf(normalizeTicketTierName(first.name) as (typeof EVENT_TICKET_TIER_NAMES)[number]) -
    EVENT_TICKET_TIER_NAMES.indexOf(normalizeTicketTierName(second.name) as (typeof EVENT_TICKET_TIER_NAMES)[number])
  );
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPrice(priceKobo: number) {
  if (priceKobo <= 0) return "Free";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(priceKobo / 100);
}

function isBookable(event: StreetzEvent) {
  const endTimestamp = Date.parse(event.endsAt ?? event.startsAt);
  return event.status === "PUBLISHED" && (!Number.isFinite(endTimestamp) || endTimestamp > Date.now());
}

function getMaxQuantity(event: StreetzEvent, ticketType: StreetzEventTicketType, isGuest: boolean) {
  if (!isBookable(event)) return 0;

  if (isGuest) {
    return Math.max(0, Math.min(ticketType.availableCount, MAX_TICKETS_PER_PURCHASE));
  }

  const userTickets = event.userTickets ?? (event.userTicket ? [event.userTicket] : []);
  const ownedCount = userTickets.filter((ticket) =>
    CONFIRMED_TICKET_STATUSES.has(ticket.status) && ticket.ticketType?.id === ticketType.id
  ).length;

  return Math.max(0, Math.min(
    ticketType.availableCount,
    ticketType.maxTicketsPerUser - ownedCount,
    MAX_TICKETS_PER_PURCHASE
  ));
}

export function TicketCheckoutModal({ event, isGuest, isBusy, onClose, onSubmit }: {
  event: StreetzEvent;
  isGuest: boolean;
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (ticketType: StreetzEventTicketType, quantity: number) => void;
}) {
  const ticketTypes = useMemo(() => getTicketTypes(event), [event]);
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState(ticketTypes[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const ticketType = ticketTypes.find((candidate) => candidate.id === selectedTicketTypeId) ?? ticketTypes[0] ?? null;
  const maxQuantity = ticketType ? getMaxQuantity(event, ticketType, isGuest) : 0;
  const selectedQuantity = maxQuantity > 0 ? Math.min(Math.max(1, quantity), maxQuantity) : 1;
  const quantityOptions = maxQuantity > 0 ? Array.from({ length: maxQuantity }, (_, index) => index + 1) : [1];
  const isSoldOut = Boolean(ticketType && ticketType.availableCount <= 0);
  const isLimitReached = Boolean(ticketType && isBookable(event) && !isSoldOut && maxQuantity <= 0);
  const isPaidEvent = Boolean(ticketType && ticketType.priceKobo > 0);
  const noun = isPaidEvent ? "ticket" : "spot";
  const selectedNoun = selectedQuantity === 1 ? noun : `${noun}s`;
  const statusCopy = !ticketType
    ? "No ticket tiers are available for this event."
    : isSoldOut
      ? "This tier is sold out."
      : isLimitReached
        ? "You have reached the ticket limit for this tier."
        : !isBookable(event)
          ? "This event is unavailable."
          : null;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-4 backdrop-blur-sm sm:p-5">
      <button className="absolute inset-0" type="button" onClick={onClose} aria-label="Close ticket selector" />
      <section
        className="relative w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-ticket-modal-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Tickets</p>
            <h2 id="event-ticket-modal-title" className="mt-1 truncate text-xl font-semibold text-[#0d0d0d]">{event.title}</h2>
            <p className="mt-1 text-sm text-[#666666]">{formatEventDate(event.startsAt)}</p>
          </div>
          <button className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8" type="button" onClick={onClose} aria-label="Close ticket selector">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
            Tier
            <select
              className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be] disabled:bg-[#fafafa]"
              value={ticketType?.id ?? ""}
              onChange={(inputEvent) => {
                setSelectedTicketTypeId(inputEvent.target.value);
                setQuantity(1);
              }}
              disabled={isBusy || ticketTypes.length <= 1}
            >
              {ticketTypes.length > 0 ? ticketTypes.map((availableTicketType) => (
                <option key={availableTicketType.id} value={availableTicketType.id}>
                  {normalizeTicketTierName(availableTicketType.name)} · {formatPrice(availableTicketType.priceKobo)}
                </option>
              )) : <option value="">No tickets available</option>}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
            Quantity
            <select
              className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be] disabled:bg-[#fafafa]"
              value={selectedQuantity}
              onChange={(inputEvent) => setQuantity(Number(inputEvent.target.value))}
              disabled={isBusy || maxQuantity <= 0}
            >
              {quantityOptions.map((availableQuantity) => (
                <option key={availableQuantity} value={availableQuantity}>
                  {availableQuantity} {availableQuantity === 1 ? noun : `${noun}s`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {statusCopy ? <p className="mt-4 rounded-2xl bg-[#fff4d9] p-3 text-sm font-medium text-[#9a6a12]">{statusCopy}</p> : null}

        <button
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={!ticketType || maxQuantity <= 0 || isBusy}
          onClick={() => ticketType && onSubmit(ticketType, selectedQuantity)}
        >
          {isBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
          {isPaidEvent ? `Buy ${selectedQuantity} ${selectedNoun}` : `Book ${selectedQuantity} ${selectedNoun}`}
        </button>
      </section>
    </div>
  );
}
