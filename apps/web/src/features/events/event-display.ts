import type { StreetzEvent, StreetzEventTicketType, TicketStatus } from "@/lib/types";

export const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80";
export const MAX_TICKETS_PER_PURCHASE = 20;
export const EVENT_CATEGORY_OPTIONS = [
  "Music",
  "Nightlife",
  "Theatre",
  "Holidays",
  "Dating",
  "Hobbies",
  "Business",
  "Food & Drink",
  "Sports & Fitness",
  "Fashion",
  "Tech",
  "Community",
] as const;

const EVENT_TICKET_TIER_NAMES = ["Regular", "VIP", "Tables"] as const;
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["CONFIRMED", "PAID", "CHECKED_IN"]);

export type EventCategoryName = (typeof EVENT_CATEGORY_OPTIONS)[number];

export function formatEventDate(value: string) {
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

export function formatPrice(priceKobo: number) {
  if (priceKobo <= 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(priceKobo / 100);
}

export function normalizeEventCategory(category: string | null | undefined): EventCategoryName | null {
  const normalizedCategory = category?.trim();

  if (normalizedCategory === "Performing & Visual Arts") {
    return "Theatre";
  }

  if (normalizedCategory && (EVENT_CATEGORY_OPTIONS as readonly string[]).includes(normalizedCategory)) {
    return normalizedCategory as EventCategoryName;
  }

  return null;
}

export function getUserTickets(event: StreetzEvent) {
  return event.userTickets ?? (event.userTicket ? [event.userTicket] : []);
}

export function hasConfirmedTicket(event: StreetzEvent) {
  return getUserTickets(event).some((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status));
}

export function getOwnedTicketTypeIds(event: StreetzEvent) {
  return new Set(
    getUserTickets(event)
      .filter((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status) && ticket.ticketType)
      .map((ticket) => ticket.ticketType?.id)
      .filter((ticketTypeId): ticketTypeId is string => Boolean(ticketTypeId))
  );
}

export function normalizeTicketTierName(name: string) {
  if (name === "General Admission") {
    return "Regular";
  }

  return (EVENT_TICKET_TIER_NAMES as readonly string[]).includes(name) ? name : "Regular";
}

export function getEventTicketTypes(event: StreetzEvent) {
  const ticketTypes = event.ticketTypes?.length ? event.ticketTypes : event.ticketType ? [event.ticketType] : [];

  return [...ticketTypes].sort(
    (first, second) =>
      EVENT_TICKET_TIER_NAMES.indexOf(normalizeTicketTierName(first.name) as (typeof EVENT_TICKET_TIER_NAMES)[number]) -
      EVENT_TICKET_TIER_NAMES.indexOf(normalizeTicketTierName(second.name) as (typeof EVENT_TICKET_TIER_NAMES)[number])
  );
}

export function getSelectedTicketType(event: StreetzEvent) {
  return getEventTicketTypes(event)[0] ?? null;
}

export function getHistoryAttendanceLabel(event: StreetzEvent) {
  return getUserTickets(event).some((ticket) => ticket.status === "CHECKED_IN") ? "Attended" : "Not checked in";
}

export function getHistoryAttendanceClass(event: StreetzEvent) {
  return getUserTickets(event).some((ticket) => ticket.status === "CHECKED_IN")
    ? "bg-[#e7f8ef] text-[#126c43]"
    : "bg-[#fafafa] text-[#666666]";
}

export function hasEventEnded(event: Pick<StreetzEvent, "startsAt" | "endsAt">) {
  const endTimestamp = Date.parse(event.endsAt ?? event.startsAt);

  return Number.isFinite(endTimestamp) && endTimestamp <= Date.now();
}

export function isMemberBookableEvent(event: StreetzEvent) {
  return event.status === "PUBLISHED" && !hasEventEnded(event);
}

export function formatEventLocation(event: Pick<StreetzEvent, "venue" | "city" | "state">) {
  return [event.venue, event.city, event.state].filter(Boolean).join(", ");
}

function getRemainingUserTicketAllowance(event: StreetzEvent, ticketType: StreetzEventTicketType | null) {
  if (!ticketType?.id) {
    return 0;
  }

  const ownedTickets = getUserTickets(event).filter(
    (ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status) && ticket.ticketType?.id === ticketType.id
  ).length;

  return Math.max(0, ticketType.maxTicketsPerUser - ownedTickets);
}

export function getMaxPurchaseQuantity(event: StreetzEvent, ticketType: StreetzEventTicketType | null) {
  if (!ticketType || !isMemberBookableEvent(event)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(ticketType.availableCount, getRemainingUserTicketAllowance(event, ticketType), MAX_TICKETS_PER_PURCHASE)
  );
}
