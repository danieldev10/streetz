import {
  EVENT_CATEGORY_OPTIONS,
  formatPrice,
  getEventTicketTypes,
  hasEventEnded,
  normalizeEventCategory,
  normalizeTicketTierName,
} from "@/features/events/event-display";
import { getCitiesForState, nigeriaStateNames } from "@/lib/nigeria-locations";
import type { EventStatus, StreetzEvent } from "@/lib/types";

export const EVENT_TICKET_TIER_NAMES = ["Regular", "VIP", "Tables"] as const;
export const SUPPORTED_EVENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const EVENT_TITLE_MAX_LENGTH = 120;
export const EVENT_DESCRIPTION_MAX_LENGTH = 600;
export const EVENT_CATEGORY_MAX_LENGTH = 40;
export const EVENT_COVER_IMAGE_MAX_LENGTH = 500;
export const EVENT_LOCATION_MAX_LENGTH = 80;
export const EVENT_VENUE_MAX_LENGTH = 120;
export const EVENT_IMAGE_FILE_NAME_MAX_LENGTH = 160;
export const EVENT_CANCELLATION_REASON_MAX_LENGTH = 500;

export const creatableEventStatuses: EventStatus[] = ["DRAFT", "PUBLISHED"];
export const editableEventStatuses: EventStatus[] = ["DRAFT", "PUBLISHED"];
export const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export type AdminEventListMode = "active" | "inactive";
export type EventTicketTierName = (typeof EVENT_TICKET_TIER_NAMES)[number];

export type EventFormTicketTier = {
  priceNaira: string;
  capacity: string;
  maxTicketsPerUser: string;
};

export type AdminEventFormState = {
  title: string;
  category: string;
  description: string;
  coverImage: string;
  venue: string;
  state: string;
  city: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  ticketTiers: Record<EventTicketTierName, EventFormTicketTier>;
};

type AdminEventTicketTypePayload = {
  name: EventTicketTierName;
  priceKobo: number;
  capacity: number;
  maxTicketsPerUser: number;
};

export type AdminEventPayload = {
  title: string;
  category: string;
  description: string;
  coverImage: string;
  venue: string;
  state: string;
  city: string;
  startsAt: string;
  endsAt?: string;
  status: EventStatus;
  bookingAccess: "PUBLIC" | "MEMBERS_ONLY";
  ticketTypes: AdminEventTicketTypePayload[];
};

type AdminEventPayloadResult =
  | { ok: true; payload: AdminEventPayload }
  | { ok: false; error: string };

export type CancellationImpact = {
  activeReservations: number;
  paidTickets: number;
  totalPaidAmountKobo: number;
};

function createDefaultTicketTiers(): Record<EventTicketTierName, EventFormTicketTier> {
  return {
    Regular: {
      priceNaira: "",
      capacity: "100",
      maxTicketsPerUser: "4",
    },
    VIP: {
      priceNaira: "",
      capacity: "50",
      maxTicketsPerUser: "4",
    },
    Tables: {
      priceNaira: "",
      capacity: "10",
      maxTicketsPerUser: "1",
    },
  };
}

export function createEmptyEventForm(): AdminEventFormState {
  return {
    title: "",
    category: "",
    description: "",
    coverImage: "",
    venue: "",
    state: "",
    city: "",
    startsAt: "",
    endsAt: "",
    status: "DRAFT",
    ticketTiers: createDefaultTicketTiers(),
  };
}

function findEventStateForCity(city: string) {
  const normalizedCity = city.trim().toLowerCase();

  if (!normalizedCity) {
    return null;
  }

  return (
    nigeriaStateNames.find((state) =>
      getCitiesForState(state).some((candidate) => candidate.toLowerCase() === normalizedCity),
    ) ?? null
  );
}

function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 16);
}

export function getEventForm(event: StreetzEvent): AdminEventFormState {
  const ticketTiers = createDefaultTicketTiers();

  getEventTicketTypes(event).forEach((ticketType) => {
    const normalizedName = normalizeTicketTierName(ticketType.name);
    const name = EVENT_TICKET_TIER_NAMES.includes(normalizedName as EventTicketTierName)
      ? (normalizedName as EventTicketTierName)
      : "Regular";

    ticketTiers[name] = {
      priceNaira: ticketType.priceKobo > 0 ? String(ticketType.priceKobo / 100) : "",
      capacity: String(ticketType.capacity),
      maxTicketsPerUser: String(ticketType.maxTicketsPerUser),
    };
  });

  return {
    title: event.title,
    category: normalizeEventCategory(event.category) ?? "",
    description: event.description ?? "",
    coverImage: event.coverImage ?? "",
    venue: event.venue,
    state: event.state ?? findEventStateForCity(event.city) ?? "",
    city: event.city,
    startsAt: toDateTimeLocal(event.startsAt),
    endsAt: toDateTimeLocal(event.endsAt),
    status: event.status,
    ticketTiers,
  };
}

export function buildAdminEventPayload(eventForm: AdminEventFormState): AdminEventPayloadResult {
  const title = eventForm.title.trim();
  const category = eventForm.category.trim();
  const description = eventForm.description.trim();
  const venue = eventForm.venue.trim();
  const state = eventForm.state.trim();
  const city = eventForm.city.trim();

  if (title.length < 2) {
    return { ok: false, error: "Event title must be at least 2 characters." };
  }

  if (title.length > EVENT_TITLE_MAX_LENGTH) {
    return { ok: false, error: `Event title must be ${EVENT_TITLE_MAX_LENGTH} characters or fewer.` };
  }

  if (description.length > EVENT_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `Event description must be ${EVENT_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (!(EVENT_CATEGORY_OPTIONS as readonly string[]).includes(category)) {
    return { ok: false, error: "Choose a valid event category." };
  }

  if (category.length > EVENT_CATEGORY_MAX_LENGTH) {
    return {
      ok: false,
      error: `Event category must be ${EVENT_CATEGORY_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (eventForm.coverImage.length > EVENT_COVER_IMAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Cover image URL must be ${EVENT_COVER_IMAGE_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (venue.length < 2) {
    return { ok: false, error: "Event venue must be at least 2 characters." };
  }

  if (venue.length > EVENT_VENUE_MAX_LENGTH) {
    return { ok: false, error: `Event venue must be ${EVENT_VENUE_MAX_LENGTH} characters or fewer.` };
  }

  if (!eventForm.startsAt) {
    return { ok: false, error: "Event start date is required." };
  }

  if (!state || !city) {
    return { ok: false, error: "Event state and city are required." };
  }

  if (state.length > EVENT_LOCATION_MAX_LENGTH || city.length > EVENT_LOCATION_MAX_LENGTH) {
    return {
      ok: false,
      error: `Event state and city must be ${EVENT_LOCATION_MAX_LENGTH} characters or fewer.`,
    };
  }

  const startsAtTime = Date.parse(eventForm.startsAt);
  const endsAtTime = eventForm.endsAt ? Date.parse(eventForm.endsAt) : null;

  if (!Number.isFinite(startsAtTime)) {
    return { ok: false, error: "Event start date is invalid." };
  }

  if (endsAtTime !== null && !Number.isFinite(endsAtTime)) {
    return { ok: false, error: "Event end date is invalid." };
  }

  if (endsAtTime !== null && endsAtTime <= startsAtTime) {
    return { ok: false, error: "Event end date must be after the start date." };
  }

  let ticketTierError: string | null = null;
  const ticketTypes = EVENT_TICKET_TIER_NAMES.map((name) => {
    const tier = eventForm.ticketTiers[name];
    const priceNaira = Number(tier.priceNaira || 0);
    const capacity = Number(tier.capacity || 0);
    const maxTicketsPerUser = Number(tier.maxTicketsPerUser || 0);

    if (!ticketTierError && (!Number.isFinite(priceNaira) || priceNaira < 0)) {
      ticketTierError = `${name} price must be zero or higher.`;
    }

    if (!ticketTierError && (!Number.isInteger(capacity) || capacity < 1)) {
      ticketTierError = `${name} capacity must be at least 1.`;
    }

    if (!ticketTierError && (!Number.isInteger(maxTicketsPerUser) || maxTicketsPerUser < 1)) {
      ticketTierError = `${name} max tickets per person must be at least 1.`;
    }

    if (!ticketTierError && maxTicketsPerUser > capacity) {
      ticketTierError = `${name} max tickets per person cannot be greater than its capacity.`;
    }

    return {
      name,
      priceKobo: Math.round(priceNaira * 100),
      capacity,
      maxTicketsPerUser,
    };
  });

  if (ticketTierError) {
    return { ok: false, error: ticketTierError };
  }

  const paidTicketTypes = ticketTypes.filter((ticketType) => ticketType.priceKobo > 0);
  const ticketTypesPayload =
    paidTicketTypes.length > 0
      ? paidTicketTypes
      : ticketTypes
          .filter((ticketType) => ticketType.name === "Regular")
          .map((ticketType) => ({ ...ticketType, priceKobo: 0 }));

  if (ticketTypesPayload.length === 0) {
    return { ok: false, error: "Add at least one ticket tier." };
  }

  return {
    ok: true,
    payload: {
      title,
      category,
      description,
      coverImage: eventForm.coverImage,
      venue,
      state,
      city,
      startsAt: new Date(startsAtTime).toISOString(),
      endsAt: endsAtTime !== null ? new Date(endsAtTime).toISOString() : undefined,
      status: eventForm.status,
      bookingAccess: paidTicketTypes.length > 0 ? "MEMBERS_ONLY" : "PUBLIC",
      ticketTypes: ticketTypesPayload,
    },
  };
}

export function isAdminInactiveEvent(event: StreetzEvent) {
  return (
    event.status === "DRAFT" ||
    event.status === "CANCELLED" ||
    event.status === "COMPLETED" ||
    hasEventEnded(event)
  );
}

export function isAdminLockedEvent(event: StreetzEvent) {
  return event.status === "CANCELLED" || event.status === "COMPLETED" || hasEventEnded(event);
}

export function getAdminEventStatusLabel(event: StreetzEvent) {
  if (event.status === "DRAFT") {
    return "draft";
  }

  if (event.status === "CANCELLED") {
    return "cancelled";
  }

  if (event.status === "COMPLETED" || hasEventEnded(event)) {
    return "completed";
  }

  return event.status.toLowerCase();
}

export function getAdminEventStatusClass(event: StreetzEvent) {
  if (event.status === "PUBLISHED" && !hasEventEnded(event)) {
    return "bg-[#f6e0f6] text-[#9d2a9e]";
  }

  if (event.status === "CANCELLED") {
    return "bg-red-50 text-red-600";
  }

  return "bg-[#fafafa] text-[#777777]";
}

export function getTicketTypeSummary(event: StreetzEvent) {
  const ticketTypes = getEventTicketTypes(event);

  if (ticketTypes.length === 0) {
    return "No ticket";
  }

  if (ticketTypes.every((ticketType) => ticketType.priceKobo <= 0)) {
    return "Free";
  }

  return ticketTypes
    .map((ticketType) => `${normalizeTicketTierName(ticketType.name)} ${formatPrice(ticketType.priceKobo)}`)
    .join(" · ");
}

export function getTotalTicketCapacity(event: StreetzEvent) {
  return getEventTicketTypes(event).reduce((total, ticketType) => total + ticketType.capacity, 0);
}

export function getCancellationImpact(event: StreetzEvent): CancellationImpact {
  const ticketTypes = getEventTicketTypes(event);
  const paidTickets =
    event.attendeeCount ?? ticketTypes.reduce((total, ticketType) => total + ticketType.soldCount, 0);
  const activeReservations =
    event.reservationCount ?? ticketTypes.reduce((total, ticketType) => total + ticketType.reservedCount, 0);
  const totalPaidAmountKobo =
    event.totalPaidAmountKobo ??
    ticketTypes.reduce((total, ticketType) => total + ticketType.soldCount * ticketType.priceKobo, 0);

  return { activeReservations, paidTickets, totalPaidAmountKobo };
}
