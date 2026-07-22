"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Mail, Ticket, X } from "lucide-react";
import { apiRequest, getUserErrorMessage } from "@/lib/api";
import type { StreetzEvent, StreetzEventTicketType, TicketStatus } from "@/lib/types";

const MAX_TICKETS_PER_PURCHASE = 20;
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["CONFIRMED", "PAID", "CHECKED_IN"]);
const EVENT_TICKET_TIER_NAMES = ["Regular", "VIP", "Tables"] as const;

type GuestTicketRequest = {
  requestId: string;
  email: string;
  expiresInMinutes: number;
  verificationCode?: string;
};

export type GuestTicketBooking = {
  orderId: string;
  email: string;
  displayName: string;
  emailSent: boolean;
  manageUrl: string;
  event: {
    id: string;
    title: string;
    venue: string;
    state: string | null;
    city: string;
    startsAt: string;
    endsAt: string | null;
  };
  ticketType: {
    id: string;
    name: string;
    priceKobo: number;
  };
  tickets: Array<{
    id: string;
    code: string;
    status: TicketStatus;
    createdAt: string;
  }>;
};

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
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos"
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
    return Math.max(0, Math.min(ticketType.availableCount, ticketType.maxTicketsPerUser, MAX_TICKETS_PER_PURCHASE));
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

export function TicketCheckoutModal({ event, isGuest, isBusy, initialTicketTypeId, initialQuantity = 1, onClose, onSubmit, onGuestBooked }: {
  event: StreetzEvent;
  isGuest: boolean;
  isBusy: boolean;
  initialTicketTypeId?: string | null;
  initialQuantity?: number;
  onClose: () => void;
  onSubmit: (ticketType: StreetzEventTicketType, quantity: number) => void;
  onGuestBooked?: (booking: GuestTicketBooking) => void;
}) {
  const ticketTypes = useMemo(() => getTicketTypes(event), [event]);
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState(initialTicketTypeId ?? ticketTypes[0]?.id ?? "");
  const [quantity, setQuantity] = useState(initialQuantity);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [guestRequest, setGuestRequest] = useState<GuestTicketRequest | null>(null);
  const [guestBooking, setGuestBooking] = useState<GuestTicketBooking | null>(null);
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticketType = ticketTypes.find((candidate) => candidate.id === selectedTicketTypeId) ?? ticketTypes[0] ?? null;
  const maxQuantity = ticketType ? getMaxQuantity(event, ticketType, isGuest) : 0;
  const selectedQuantity = maxQuantity > 0 ? Math.min(Math.max(1, quantity), maxQuantity) : 1;
  const quantityOptions = maxQuantity > 0 ? Array.from({ length: maxQuantity }, (_, index) => index + 1) : [1];
  const isSoldOut = Boolean(ticketType && ticketType.availableCount <= 0);
  const isLimitReached = Boolean(ticketType && isBookable(event) && !isSoldOut && maxQuantity <= 0);
  const isPaidEvent = Boolean(ticketType && ticketType.priceKobo > 0);
  const isPublicGuestBooking = Boolean(
    isGuest && ticketType && ticketType.priceKobo <= 0
  );
  const isWorking = isBusy || isGuestSubmitting;
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

  async function requestGuestTicket() {
    if (!ticketType || displayName.trim().length < 2 || !email.trim()) {
      setError("Enter your name and email address.");
      return;
    }

    setIsGuestSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<GuestTicketRequest>(`/public/events/${event.id}/guest-tickets/request`, {
        method: "POST",
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          ticketTypeId: ticketType.id,
          quantity: selectedQuantity
        })
      });
      setGuestRequest(response);
      setEmail(response.email);
    } catch (caught) {
      setError(getUserErrorMessage(caught));
    } finally {
      setIsGuestSubmitting(false);
    }
  }

  async function confirmGuestTicket() {
    if (!guestRequest || verificationCode.trim().length !== 6) {
      setError("Enter the six-digit code from your email.");
      return;
    }

    setIsGuestSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<GuestTicketBooking>(`/public/events/${event.id}/guest-tickets/confirm`, {
        method: "POST",
        body: JSON.stringify({ requestId: guestRequest.requestId, code: verificationCode.trim() })
      });
      setGuestBooking(response);
      onGuestBooked?.(response);
    } catch (caught) {
      setError(getUserErrorMessage(caught));
    } finally {
      setIsGuestSubmitting(false);
    }
  }

  if (guestBooking) {
    return (
      <ModalShell title="Tickets confirmed" eyebrow="Free event" onClose={onClose} disableClose={false}>
        <div className="mt-5 rounded-[20px] bg-[#e7f8ef] p-4 text-[#126c43]">
          <CheckCircle2 className="size-7" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold">Your {guestBooking.tickets.length === 1 ? "ticket is" : "tickets are"} ready.</p>
          <p className="mt-1 text-xs leading-5">
            {guestBooking.emailSent
              ? `We sent the details to ${guestBooking.email}.`
              : "Keep these codes. The confirmation email could not be sent."}
          </p>
        </div>
        <div className="mt-4 grid gap-2">
          {guestBooking.tickets.map((ticket, index) => (
            <div key={ticket.id} className="rounded-2xl border border-black/8 bg-[#fafafa] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Ticket {index + 1}</p>
              <p className="mt-1 font-mono text-lg font-bold tracking-wide text-[#0d0d0d]">{ticket.code}</p>
            </div>
          ))}
        </div>
        <button className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white" type="button" onClick={onClose}>
          Done
        </button>
        <a className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium" href={guestBooking.manageUrl}>
          View my tickets
        </a>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={guestRequest ? "Check your email" : event.title}
      eyebrow={guestRequest ? "Verify email" : "Tickets"}
      onClose={onClose}
      disableClose={isWorking}
      subtitle={guestRequest ? `We sent a six-digit code to ${guestRequest.email}.` : formatEventDate(event.startsAt)}
    >
      {!guestRequest ? (
        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
            Tier
            <select
              className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be] disabled:bg-[#fafafa]"
              value={ticketType?.id ?? ""}
              onChange={(inputEvent) => {
                setSelectedTicketTypeId(inputEvent.target.value);
                setQuantity(1);
                setError(null);
              }}
              disabled={isWorking || ticketTypes.length <= 1}
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
              disabled={isWorking || maxQuantity <= 0}
            >
              {quantityOptions.map((availableQuantity) => (
                <option key={availableQuantity} value={availableQuantity}>
                  {availableQuantity} {availableQuantity === 1 ? noun : `${noun}s`}
                </option>
              ))}
            </select>
          </label>

          {isPublicGuestBooking ? (
            <>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Name
                <input
                  className="h-12 rounded-full border border-black/8 px-4 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                  value={displayName}
                  onChange={(inputEvent) => setDisplayName(inputEvent.target.value)}
                  autoComplete="name"
                  maxLength={80}
                  placeholder="Your name"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Email
                <input
                  className="h-12 rounded-full border border-black/8 px-4 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                  type="email"
                  value={email}
                  onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                />
              </label>
              <p className="flex items-start gap-2 rounded-2xl bg-[#fafafa] p-3 text-xs leading-5 text-[#666666]">
                <Mail className="mt-0.5 size-4 shrink-0 text-[#bd40be]" aria-hidden="true" />
                We verify your email before confirming the tickets and send every ticket code there.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
            Verification code
            <input
              className="h-14 rounded-full border border-black/8 px-4 text-center text-xl font-semibold tracking-[0.3em] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(inputEvent) => setVerificationCode(inputEvent.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              placeholder="000000"
            />
          </label>
          {guestRequest.verificationCode ? (
            <p className="rounded-2xl bg-[#fff4d9] p-3 text-xs font-medium text-[#9a6a12]">
              Development code: {guestRequest.verificationCode}
            </p>
          ) : null}
          <button
            className="text-left text-xs font-medium text-[#7c1f7d]"
            type="button"
            onClick={() => {
              setGuestRequest(null);
              setVerificationCode("");
              setError(null);
            }}
            disabled={isWorking}
          >
            Change email or resend code
          </button>
        </div>
      )}

      {statusCopy ? <p className="mt-4 rounded-2xl bg-[#fff4d9] p-3 text-sm font-medium text-[#9a6a12]">{statusCopy}</p> : null}
      {error ? <p className="mt-4 rounded-2xl bg-[#fdecec] p-3 text-sm font-medium text-[#b3261e]">{error}</p> : null}

      <button
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={!ticketType || maxQuantity <= 0 || isWorking}
        onClick={() => {
          if (guestRequest) {
            void confirmGuestTicket();
          } else if (isPublicGuestBooking) {
            void requestGuestTicket();
          } else if (ticketType) {
            onSubmit(ticketType, selectedQuantity);
          }
        }}
      >
        {isWorking ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
        {guestRequest
          ? "Confirm free tickets"
          : isPublicGuestBooking
            ? "Email verification code"
            : isPaidEvent
              ? `Buy ${selectedQuantity} ${selectedNoun}`
              : `Book ${selectedQuantity} ${selectedNoun}`}
      </button>
    </ModalShell>
  );
}

function ModalShell({ title, eyebrow, subtitle, onClose, disableClose, children }: {
  title: string;
  eyebrow: string;
  subtitle?: string;
  onClose: () => void;
  disableClose: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-4 backdrop-blur-sm sm:p-5">
      <button className="absolute inset-0" type="button" onClick={onClose} disabled={disableClose} aria-label="Close ticket selector" />
      <section className="relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]" role="dialog" aria-modal="true" aria-labelledby="event-ticket-modal-title">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{eyebrow}</p>
            <h2 id="event-ticket-modal-title" className="mt-1 truncate text-xl font-semibold text-[#0d0d0d]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-[#666666]">{subtitle}</p> : null}
          </div>
          <button className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8" type="button" onClick={onClose} disabled={disableClose} aria-label="Close ticket selector">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
