"use client";

import Image from "next/image";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Drama,
  Dumbbell,
  Gamepad2,
  Gift,
  Heart,
  ImagePlus,
  Laptop,
  LoaderCircle,
  MapPin,
  Moon,
  Music,
  PartyPopper,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shirt,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  UsersRound,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { type AuthPromptKind } from "@/components/app/public-route";
import { ScreenHeader } from "@/components/app/navigation";
import { useToast } from "@/components/app/toast-provider";
import { LoadingState } from "@/components/loading-state";
import { RafflesList } from "@/features/raffles/raffles-list";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { savePendingEventCheckout } from "@/lib/pending-event-checkout";
import { getAbsoluteAppUrl, shareOrCopyLink } from "@/lib/share";
import { EVENT_IMAGE_UPLOAD_MAX_BYTES, prepareImageForUpload } from "@/lib/image-upload";
import { getCitiesForState, nigeriaStateNames } from "@/lib/nigeria-locations";
import type { EventStatus, StreetzEvent, StreetzEventTicketType, StreetzProfile, StreetzUser, TicketStatus } from "@/lib/types";

const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80";
const EVENT_TICKET_TIER_NAMES = ["Regular", "VIP", "Tables"] as const;
const EVENT_CATEGORY_OPTIONS = [
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
const SUPPORTED_EVENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["PAID", "CHECKED_IN"]);
const EVENT_TITLE_MAX_LENGTH = 120;
const EVENT_DESCRIPTION_MAX_LENGTH = 600;
const EVENT_CATEGORY_MAX_LENGTH = 40;
const EVENT_COVER_IMAGE_MAX_LENGTH = 500;
const EVENT_LOCATION_MAX_LENGTH = 80;
const EVENT_VENUE_MAX_LENGTH = 120;
const EVENT_IMAGE_FILE_NAME_MAX_LENGTH = 160;
const EVENT_CANCELLATION_REASON_MAX_LENGTH = 500;
const MAX_TICKETS_PER_PURCHASE = 20;
const creatableEventStatuses: EventStatus[] = ["DRAFT", "PUBLISHED"];
const editableEventStatuses: EventStatus[] = ["DRAFT", "PUBLISHED"];
const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

type EventViewMode = "tickets" | "events" | "raffles" | "history";
type AdminEventView = "list" | "form";
type AdminEventMode = "list" | "create" | "edit";
type AdminEventListMode = "active" | "inactive";
type EventTicketTierName = (typeof EVENT_TICKET_TIER_NAMES)[number];
type EventCategoryName = (typeof EVENT_CATEGORY_OPTIONS)[number];
type EventFormTicketTier = {
  priceNaira: string;
  capacity: string;
  maxTicketsPerUser: string;
};

type EventForm = {
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

type EventImageUploadResponse = {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresInSeconds: number;
};

const emptyEventForm: EventForm = {
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
  ticketTiers: {
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
  },
};

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

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPrice(priceKobo: number) {
  if (priceKobo <= 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(priceKobo / 100);
}

function normalizeEventCategory(category: string | null | undefined): EventCategoryName | null {
  const normalizedCategory = category?.trim();

  if (normalizedCategory === "Performing & Visual Arts") {
    return "Theatre";
  }

  if (normalizedCategory && (EVENT_CATEGORY_OPTIONS as readonly string[]).includes(normalizedCategory)) {
    return normalizedCategory as EventCategoryName;
  }

  return null;
}

function hasConfirmedTicket(event: StreetzEvent) {
  return getUserTickets(event).some((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status));
}

function getUserTickets(event: StreetzEvent) {
  return event.userTickets ?? (event.userTicket ? [event.userTicket] : []);
}

function getOwnedTicketTypeIds(event: StreetzEvent) {
  return new Set(
    getUserTickets(event)
      .filter((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status) && ticket.ticketType)
      .map((ticket) => ticket.ticketType?.id)
      .filter((ticketTypeId): ticketTypeId is string => Boolean(ticketTypeId))
  );
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

function getSelectedTicketType(event: StreetzEvent, selectedTicketTypeId: string | undefined) {
  const ticketTypes = getEventTicketTypes(event);

  return ticketTypes.find((ticketType) => ticketType.id === selectedTicketTypeId) ?? ticketTypes[0] ?? null;
}

function getTicketTypeSummary(event: StreetzEvent) {
  const ticketTypes = getEventTicketTypes(event);

  if (ticketTypes.length === 0) {
    return "No ticket";
  }

  if (ticketTypes.every((ticketType) => ticketType.priceKobo <= 0)) {
    return "Free";
  }

  return ticketTypes.map((ticketType) => `${normalizeTicketTierName(ticketType.name)} ${formatPrice(ticketType.priceKobo)}`).join(" · ");
}

function getHistoryAttendanceLabel(event: StreetzEvent) {
  return getUserTickets(event).some((ticket) => ticket.status === "CHECKED_IN") ? "Attended" : "Not checked in";
}

function getHistoryAttendanceClass(event: StreetzEvent) {
  return getUserTickets(event).some((ticket) => ticket.status === "CHECKED_IN")
    ? "bg-[#e7f8ef] text-[#126c43]"
    : "bg-[#fafafa] text-[#666666]";
}

function getTotalTicketCapacity(event: StreetzEvent) {
  return getEventTicketTypes(event).reduce((total, ticketType) => total + ticketType.capacity, 0);
}

function getEventEndTimestamp(event: Pick<StreetzEvent, "startsAt" | "endsAt">) {
  return Date.parse(event.endsAt ?? event.startsAt);
}

function hasEventEnded(event: Pick<StreetzEvent, "startsAt" | "endsAt">) {
  const endTimestamp = getEventEndTimestamp(event);

  return Number.isFinite(endTimestamp) && endTimestamp <= Date.now();
}

function isMemberBookableEvent(event: StreetzEvent) {
  return event.status === "PUBLISHED" && !hasEventEnded(event);
}

function isAdminInactiveEvent(event: StreetzEvent) {
  return event.status === "DRAFT" || event.status === "CANCELLED" || event.status === "COMPLETED" || hasEventEnded(event);
}

function isAdminLockedEvent(event: StreetzEvent) {
  return event.status === "CANCELLED" || event.status === "COMPLETED" || hasEventEnded(event);
}

function getAdminEventStatusLabel(event: StreetzEvent) {
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

function getAdminEventStatusClass(event: StreetzEvent) {
  if (event.status === "PUBLISHED" && !hasEventEnded(event)) {
    return "bg-[#f6e0f6] text-[#9d2a9e]";
  }

  if (event.status === "CANCELLED") {
    return "bg-red-50 text-red-600";
  }

  return "bg-[#fafafa] text-[#777777]";
}

function formatEventLocation(event: Pick<StreetzEvent, "venue" | "city" | "state">) {
  return [event.venue, event.city, event.state].filter(Boolean).join(", ");
}

function getCancellationImpact(event: StreetzEvent) {
  const ticketTypes = getEventTicketTypes(event);
  const paidTickets = event.attendeeCount ?? ticketTypes.reduce((total, ticketType) => total + ticketType.soldCount, 0);
  const activeReservations = event.reservationCount ?? ticketTypes.reduce((total, ticketType) => total + ticketType.reservedCount, 0);
  const totalPaidAmountKobo =
    event.totalPaidAmountKobo ??
    ticketTypes.reduce((total, ticketType) => total + ticketType.soldCount * ticketType.priceKobo, 0);

  return { activeReservations, paidTickets, totalPaidAmountKobo };
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

function getMaxPurchaseQuantity(event: StreetzEvent, ticketType: StreetzEventTicketType | null) {
  if (!ticketType || !isMemberBookableEvent(event)) {
    return 0;
  }

  return Math.max(0, Math.min(ticketType.availableCount, getRemainingUserTicketAllowance(event, ticketType), MAX_TICKETS_PER_PURCHASE));
}

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

function getDefaultEventTicketTiers(): Record<EventTicketTierName, EventFormTicketTier> {
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

function getEventForm(event: StreetzEvent): EventForm {
  const ticketTiers = getDefaultEventTicketTiers();

  getEventTicketTypes(event).forEach((ticketType) => {
    const name = normalizeTicketTierName(ticketType.name);

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

export function EventsTab({
  token,
  user,
  adminMode = "list",
  adminEventId = null,
  onAuthRequired,
}: {
  token?: string | null;
  user?: StreetzUser | null;
  adminMode?: AdminEventMode;
  adminEventId?: string | null;
  onAuthRequired?: (kind?: AuthPromptKind) => void;
}) {
  const router = useRouter();
  const isGuest = !token || !user;
  const isAdmin = user?.role === "ADMIN";
  const [events, setEvents] = useState<StreetzEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<StreetzEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventViewMode, setEventViewMode] = useState<EventViewMode>("events");
  const viewModeInitializedRef = useRef(false);
  const filterInitializedRef = useRef(false);
  const [adminEventView, setAdminEventView] = useState<AdminEventView>(adminMode === "list" ? "list" : "form");
  const [editingEventId, setEditingEventId] = useState<string | null>(adminMode === "edit" ? adminEventId : null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [eventFilterCategory, setEventFilterCategory] = useState<EventCategoryName | "">("");
  const [eventFilterState, setEventFilterState] = useState("");
  const [eventFilterCity, setEventFilterCity] = useState("");
  const [isEventFilterOpen, setIsEventFilterOpen] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [ticketModalEventId, setTicketModalEventId] = useState<string | null>(null);
  const [bookingQuantities, setBookingQuantities] = useState<Record<string, number>>({});
  const [selectedTicketTypeIds, setSelectedTicketTypeIds] = useState<Record<string, string>>({});
  const [adminEventListMode, setAdminEventListMode] = useState<AdminEventListMode>("active");
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false);
  const [pendingCancelEvent, setPendingCancelEvent] = useState<StreetzEvent | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancellingEvent, setIsCancellingEvent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { showToast } = useToast();

  const orderedEvents = useMemo(
    () => [...events].sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
    [events]
  );
  const orderedHistoryEvents = useMemo(
    () => [...historyEvents].sort((first, second) => Date.parse(second.startsAt) - Date.parse(first.startsAt)),
    [historyEvents]
  );
  const adminActiveEvents = useMemo(() => orderedEvents.filter((event) => !isAdminInactiveEvent(event)), [orderedEvents]);
  const adminInactiveEvents = useMemo(() => orderedEvents.filter(isAdminInactiveEvent), [orderedEvents]);
  const adminVisibleEvents = adminEventListMode === "inactive" ? adminInactiveEvents : adminActiveEvents;
  const editingEvent = useMemo(
    () => events.find((event) => event.id === editingEventId) ?? null,
    [editingEventId, events]
  );
  const ticketModalEvent = useMemo(
    () => events.find((event) => event.id === ticketModalEventId) ?? null,
    [events, ticketModalEventId]
  );
  const isEditingLockedEvent = Boolean(editingEvent && isAdminLockedEvent(editingEvent));
  const canCancelEditingEvent = Boolean(
    editingEvent && editingEvent.status === "PUBLISHED" && !hasEventEnded(editingEvent)
  );
  const ticketEvents = useMemo(() => orderedEvents.filter(hasConfirmedTicket), [orderedEvents]);
  const exploreEvents = useMemo(
    () => orderedEvents.filter((event) => isMemberBookableEvent(event) && !hasConfirmedTicket(event)),
    [orderedEvents]
  );
  const memberEventsForMode = useMemo(
    () => (isGuest ? exploreEvents : eventViewMode === "tickets" ? ticketEvents : eventViewMode === "history" ? orderedHistoryEvents : exploreEvents),
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
  const visibleMemberEvents = useMemo(() => {
    return memberEventsForMode.filter((event) => {
      if (eventFilterCategory && normalizeEventCategory(event.category) !== eventFilterCategory) {
        return false;
      }

      if (eventViewMode === "events" && eventFilterState && getEventState(event) !== eventFilterState) {
        return false;
      }

      if (eventViewMode === "events" && eventFilterCity && event.city !== eventFilterCity) {
        return false;
      }

      return true;
    });
  }, [eventFilterCategory, eventFilterCity, eventFilterState, eventViewMode, memberEventsForMode]);
  const hasEventLocationFilter = Boolean(eventFilterState || eventFilterCity);
  const hasEventCategoryFilter = Boolean(eventFilterCategory);
  const hasMemberFilter = hasEventCategoryFilter || (eventViewMode === "events" && hasEventLocationFilter);
  const emptyMemberTitle = !isGuest && eventViewMode === "tickets"
    ? hasEventCategoryFilter
      ? "No tickets found"
      : "No tickets yet"
    : !isGuest && eventViewMode === "history"
      ? hasEventCategoryFilter
        ? "No history found"
        : "No event history"
      : hasMemberFilter
        ? "No events found"
        : "No events yet";
  const emptyMemberDescription = !isGuest && eventViewMode === "tickets"
    ? hasEventCategoryFilter
      ? "Try another category."
      : "Tickets you book or buy will appear here."
    : !isGuest && eventViewMode === "history"
      ? hasEventCategoryFilter
        ? "Try another category."
        : "Past ticketed events will appear here."
      : hasMemberFilter
        ? "Try another category, state, or city."
        : "Events you have not booked yet will appear here.";
  const eventStateOptions = eventForm.state && !nigeriaStateNames.includes(eventForm.state)
    ? [...nigeriaStateNames, eventForm.state]
    : nigeriaStateNames;
  const knownEventCityOptions = getCitiesForState(eventForm.state);
  const eventCityOptions = eventForm.city && !knownEventCityOptions.includes(eventForm.city)
    ? [...knownEventCityOptions, eventForm.city]
    : knownEventCityOptions;

  async function loadEvents(options: { clearNotice?: boolean; showLoading?: boolean } = {}) {
    const { clearNotice = true, showLoading = true } = options;

    if (showLoading) {
      setIsLoadingEvents(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const fetchProfile = !isGuest && !filterInitializedRef.current && !isAdmin;
      const eventsPath = isGuest ? "/public/events" : isAdmin ? "/admin/events" : "/events";
      const requestOptions = isGuest ? undefined : { headers: authHeaders(token as string) };
      const historyRequest = !isGuest && !isAdmin
        ? apiRequest<{ events: StreetzEvent[] }>("/events/history", { headers: authHeaders(token as string) })
        : Promise.resolve({ events: [] });
      const [eventsResult, historyResult, profileResult] = await Promise.all([
        apiRequest<{ events: StreetzEvent[] }>(eventsPath, requestOptions),
        historyRequest,
        fetchProfile
          ? apiRequest<StreetzProfile | null>("/profiles/me", { headers: authHeaders(token as string) }).catch(() => null)
          : Promise.resolve(null)
      ]);

      setEvents(eventsResult.events);
      setHistoryEvents(historyResult.events);

      if (!isAdmin && !isGuest && !viewModeInitializedRef.current) {
        viewModeInitializedRef.current = true;
        const hasCurrentTickets = eventsResult.events.some(hasConfirmedTicket);
        const hasExploreEvents = eventsResult.events.some((event) => isMemberBookableEvent(event) && !hasConfirmedTicket(event));

        setEventViewMode(hasCurrentTickets ? "tickets" : hasExploreEvents ? "events" : historyResult.events.length > 0 ? "history" : "events");
      }

      if (isGuest && !viewModeInitializedRef.current) {
        viewModeInitializedRef.current = true;
        setEventViewMode("events");
      }

      if (!filterInitializedRef.current) {
        filterInitializedRef.current = true;

        if (profileResult?.state) {
          setEventFilterState(profileResult.state);
        }
      }
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      if (showLoading) {
        setIsLoadingEvents(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (adminMode === "list") {
        setAdminEventView("list");
        setEditingEventId(null);
        setEventForm(emptyEventForm);
        return;
      }

      setAdminEventView("form");
      setNotice(null);

      if (adminMode === "create") {
        setEditingEventId(null);
        setEventForm(emptyEventForm);
        return;
      }

      setEditingEventId(adminEventId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [adminMode, adminEventId, isAdmin]);

  useEffect(() => {
    if (!isAdmin || adminMode !== "edit" || !adminEventId) {
      return;
    }

    const event = events.find((candidate) => candidate.id === adminEventId);

    const timer = window.setTimeout(() => {
      if (event) {
        setEditingEventId(event.id);
        setEventForm(getEventForm(event));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [adminMode, adminEventId, events, isAdmin]);

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

  function startCreateEvent() {
    router.push("/events/create");
    setEditingEventId(null);
    setEventForm(emptyEventForm);
    setAdminEventView("form");
    setNotice(null);
  }

  function startEditEvent(event: StreetzEvent) {
    router.push(`/events/${event.id}/edit`);
    setEditingEventId(event.id);
    setEventForm(getEventForm(event));
    setAdminEventView("form");
    setNotice(null);
  }

  function closeAdminEventForm() {
    router.push("/events");
    setAdminEventView("list");
    setEditingEventId(null);
    setEventForm(emptyEventForm);
    setNotice(null);
  }

  async function uploadCoverImage(inputEvent: ChangeEvent<HTMLInputElement>) {
    const input = inputEvent.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!SUPPORTED_EVENT_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_EVENT_IMAGE_TYPES)[number])) {
      setNotice("Only JPG, PNG, and WebP event images are supported.");
      input.value = "";
      return;
    }

    if (file.name.length > EVENT_IMAGE_FILE_NAME_MAX_LENGTH) {
      setNotice(`Event image file name must be ${EVENT_IMAGE_FILE_NAME_MAX_LENGTH} characters or fewer.`);
      input.value = "";
      return;
    }

    setIsUploadingCoverImage(true);
    setNotice(null);

    try {
      const uploadFile = await prepareImageForUpload(file, {
        maxBytes: EVENT_IMAGE_UPLOAD_MAX_BYTES,
        maxDimension: 2000,
        quality: 0.84,
      });

      if (uploadFile.name.length > EVENT_IMAGE_FILE_NAME_MAX_LENGTH) {
        throw new Error(`Event image file name must be ${EVENT_IMAGE_FILE_NAME_MAX_LENGTH} characters or fewer.`);
      }

      const upload = await apiRequest<EventImageUploadResponse>("/admin/events/images/presign", {
        method: "POST",
        headers: authHeaders(token as string),
        body: JSON.stringify({
          fileName: uploadFile.name,
          contentType: uploadFile.type,
          fileSizeBytes: uploadFile.size,
        }),
      });

      const uploadResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": uploadFile.type,
        },
        body: uploadFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("S3 rejected the event image upload. Check the bucket CORS settings.");
      }

      setEventForm((current) => ({ ...current, coverImage: upload.publicUrl }));
      setNotice("Event image uploaded.");
    } catch (error) {
      const message = getUserErrorMessage(error);
      setNotice(message === "Failed to fetch" ? "Event image upload failed. Check the bucket CORS settings, then try again." : message);
    } finally {
      setIsUploadingCoverImage(false);
      input.value = "";
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    if (isUploadingCoverImage) {
      setNotice("Wait for the event image upload to finish before saving.");
      return;
    }

    setIsSavingEvent(true);
    setNotice(null);

    const title = eventForm.title.trim();
    const category = eventForm.category.trim();
    const description = eventForm.description.trim();
    const venue = eventForm.venue.trim();
    const state = eventForm.state.trim();
    const city = eventForm.city.trim();

    if (title.length < 2) {
      setNotice("Event title must be at least 2 characters.");
      setIsSavingEvent(false);
      return;
    }

    if (title.length > EVENT_TITLE_MAX_LENGTH) {
      setNotice(`Event title must be ${EVENT_TITLE_MAX_LENGTH} characters or fewer.`);
      setIsSavingEvent(false);
      return;
    }

    if (description.length > EVENT_DESCRIPTION_MAX_LENGTH) {
      setNotice(`Event description must be ${EVENT_DESCRIPTION_MAX_LENGTH} characters or fewer.`);
      setIsSavingEvent(false);
      return;
    }

    if (!(EVENT_CATEGORY_OPTIONS as readonly string[]).includes(category)) {
      setNotice("Choose a valid event category.");
      setIsSavingEvent(false);
      return;
    }

    if (category.length > EVENT_CATEGORY_MAX_LENGTH) {
      setNotice(`Event category must be ${EVENT_CATEGORY_MAX_LENGTH} characters or fewer.`);
      setIsSavingEvent(false);
      return;
    }

    if (eventForm.coverImage.length > EVENT_COVER_IMAGE_MAX_LENGTH) {
      setNotice(`Cover image URL must be ${EVENT_COVER_IMAGE_MAX_LENGTH} characters or fewer.`);
      setIsSavingEvent(false);
      return;
    }

    if (venue.length < 2) {
      setNotice("Event venue must be at least 2 characters.");
      setIsSavingEvent(false);
      return;
    }

    if (venue.length > EVENT_VENUE_MAX_LENGTH) {
      setNotice(`Event venue must be ${EVENT_VENUE_MAX_LENGTH} characters or fewer.`);
      setIsSavingEvent(false);
      return;
    }

    if (!eventForm.startsAt) {
      setNotice("Event start date is required.");
      setIsSavingEvent(false);
      return;
    }

    if (!state || !city) {
      setNotice("Event state and city are required.");
      setIsSavingEvent(false);
      return;
    }

    if (state.length > EVENT_LOCATION_MAX_LENGTH || city.length > EVENT_LOCATION_MAX_LENGTH) {
      setNotice(`Event state and city must be ${EVENT_LOCATION_MAX_LENGTH} characters or fewer.`);
      setIsSavingEvent(false);
      return;
    }

    const startsAtTime = Date.parse(eventForm.startsAt);
    const endsAtTime = eventForm.endsAt ? Date.parse(eventForm.endsAt) : null;

    if (!Number.isFinite(startsAtTime)) {
      setNotice("Event start date is invalid.");
      setIsSavingEvent(false);
      return;
    }

    if (endsAtTime !== null && !Number.isFinite(endsAtTime)) {
      setNotice("Event end date is invalid.");
      setIsSavingEvent(false);
      return;
    }

    if (endsAtTime !== null && endsAtTime <= startsAtTime) {
      setNotice("Event end date must be after the start date.");
      setIsSavingEvent(false);
      return;
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
      setNotice(ticketTierError);
      setIsSavingEvent(false);
      return;
    }

    const paidTicketTypes = ticketTypes.filter((ticketType) => ticketType.priceKobo > 0);
    const ticketTypesPayload = paidTicketTypes.length > 0
      ? paidTicketTypes
      : ticketTypes.filter((ticketType) => ticketType.name === "Regular").map((ticketType) => ({ ...ticketType, priceKobo: 0 }));

    if (ticketTypesPayload.length === 0) {
      setNotice("Add at least one ticket tier.");
      setIsSavingEvent(false);
      return;
    }

    const payload = {
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
      ticketTypes: ticketTypesPayload,
    };

    try {
      const savedEvent = await apiRequest<StreetzEvent>(
        editingEventId ? `/admin/events/${editingEventId}` : "/admin/events",
        {
          method: editingEventId ? "PUT" : "POST",
          headers: authHeaders(token as string),
          body: JSON.stringify(payload),
        }
      );

      setEvents((current) => {
        if (editingEventId) {
          return current.map((item) => (item.id === savedEvent.id ? savedEvent : item));
        }

        return [savedEvent, ...current];
      });
      setAdminEventView("list");
      setEditingEventId(null);
      setEventForm(emptyEventForm);
      setNotice(editingEventId ? "Event updated." : "Event created.");
      router.push("/events");
      void loadEvents({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSavingEvent(false);
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
          headers: authHeaders(token as string),
          body: JSON.stringify({ quantity: safeQuantity, ticketTypeId: ticketType.id }),
        });
        setEvents((current) => current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)));
        setBookingQuantities((current) => ({ ...current, [event.id]: 1 }));
        setTicketModalEventId(null);
        setNotice(safeQuantity === 1 ? "Spot booked." : `${safeQuantity} spots booked.`);
        return;
      }

      const response = await apiRequest<{
        authorizationUrl?: string;
      }>(`/payments/events/${event.id}/ticket/initialize`, {
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

  async function cancelEvent(event: StreetzEvent) {
    if (!isAdmin) {
      return;
    }

    const trimmedReason = cancellationReason.trim();

    if (!trimmedReason) {
      setNotice("Add a cancellation reason before cancelling this event.");
      return;
    }

    setIsCancellingEvent(true);
    setNotice(null);

    try {
      const updatedEvent = await apiRequest<StreetzEvent>(`/admin/events/${event.id}`, {
        method: "PUT",
        headers: authHeaders(token as string),
        body: JSON.stringify({ status: "CANCELLED", cancellationReason: trimmedReason }),
      });

      setEvents((current) => current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)));
      setPendingCancelEvent(null);
      setCancellationReason("");
      setAdminEventListMode("inactive");
      setAdminEventView("list");
      setEditingEventId(null);
      setEventForm(emptyEventForm);
      setNotice("Event cancelled. Paid attendees remain on record so refunds can be handled manually.");
      router.push("/events");
      void loadEvents({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsCancellingEvent(false);
    }
  }

  if (isAdmin && adminEventView === "form") {
    const pendingCancelImpact = pendingCancelEvent ? getCancellationImpact(pendingCancelEvent) : null;
    const canConfirmCancellation = cancellationReason.trim().length > 0 && !isCancellingEvent;

    return (
      <section>
        <ScreenHeader
          eyebrow="Events"
          title={editingEventId ? "" : ""}
          leading={
            <button
              className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
              type="button"
              onClick={closeAdminEventForm}
              aria-label="Back to events"
              title="Back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          }
        />

        <div className="px-5 pb-24 md:px-8 md:pb-8">
          {notice ? <p className="mb-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

          <form
            onSubmit={saveEvent}
            className="mx-auto max-w-2xl rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{editingEventId ? "Edit event" : "Create event"}</h2>
                <p className="mt-1 text-sm text-[#666666]">Publish events and set ticket pricing</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                placeholder="Event title"
                value={eventForm.title}
                onChange={(inputEvent) => setEventForm((current) => ({ ...current, title: inputEvent.target.value }))}
                minLength={2}
                maxLength={EVENT_TITLE_MAX_LENGTH}
                required
              />
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Category
                <select
                  className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                  value={eventForm.category}
                  onChange={(inputEvent) => setEventForm((current) => ({ ...current, category: inputEvent.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Choose category
                  </option>
                  {EVENT_CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                className="min-h-28 rounded-[18px] border border-black/8 p-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                placeholder="Description"
                value={eventForm.description}
                onChange={(inputEvent) => setEventForm((current) => ({ ...current, description: inputEvent.target.value }))}
                maxLength={EVENT_DESCRIPTION_MAX_LENGTH}
              />
              <div className="rounded-[20px] border border-black/8 p-3">
                <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-[#fafafa] text-center">
                  {eventForm.coverImage ? (
                    <Image
                      src={eventForm.coverImage}
                      alt="Event cover preview"
                      fill
                      sizes="(max-width: 768px) 100vw, 672px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="px-4 text-sm font-medium text-[#888888]">
                      <ImagePlus className="mx-auto mb-2 size-7 text-[#bd40be]" aria-hidden="true" />
                      Upload an event cover image
                    </div>
                  )}
                  {isUploadingCoverImage ? (
                    <div className="absolute inset-0 grid place-items-center bg-white/70">
                      <LoaderCircle className="size-7 animate-spin text-[#bd40be]" aria-hidden="true" />
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label
                    className={`inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white ${isSavingEvent || isUploadingCoverImage ? "pointer-events-none opacity-60" : ""
                      }`}
                  >
                    {isUploadingCoverImage ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ImagePlus className="size-4" aria-hidden="true" />
                    )}
                    {eventForm.coverImage ? "Replace image" : "Upload image"}
                    <input
                      className="sr-only"
                      type="file"
                      accept={SUPPORTED_EVENT_IMAGE_TYPES.join(",")}
                      onChange={uploadCoverImage}
                      disabled={isSavingEvent || isUploadingCoverImage}
                    />
                  </label>
                  {eventForm.coverImage ? (
                    <button
                      className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => setEventForm((current) => ({ ...current, coverImage: "" }))}
                      disabled={isSavingEvent || isUploadingCoverImage}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                  placeholder="Venue"
                  value={eventForm.venue}
                  onChange={(inputEvent) => setEventForm((current) => ({ ...current, venue: inputEvent.target.value }))}
                  minLength={2}
                  maxLength={EVENT_VENUE_MAX_LENGTH}
                  required
                />
                <select
                  className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                  value={eventForm.state}
                  onChange={(inputEvent) =>
                    setEventForm((current) => ({
                      ...current,
                      state: inputEvent.target.value,
                      city: "",
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Choose state
                  </option>
                  {eventStateOptions.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
              <select
                className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                value={eventForm.city}
                onChange={(inputEvent) => setEventForm((current) => ({ ...current, city: inputEvent.target.value }))}
                disabled={!eventForm.state}
                required
              >
                <option value="" disabled>
                  {eventForm.state ? "Choose city" : "Choose state first"}
                </option>
                {eventCityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Starts
                  <input
                    className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                    type="datetime-local"
                    value={eventForm.startsAt}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, startsAt: inputEvent.target.value }))}
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Ends
                  <input
                    className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                    type="datetime-local"
                    value={eventForm.endsAt}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, endsAt: inputEvent.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Status
                {isEditingLockedEvent && editingEvent ? (
                  <div className="flex h-12 items-center rounded-full border border-black/8 bg-[#fafafa] px-4 text-sm font-medium normal-case tracking-normal text-[#666666]">
                    {eventStatusLabels[editingEvent.status === "PUBLISHED" && hasEventEnded(editingEvent) ? "COMPLETED" : editingEvent.status]}
                  </div>
                ) : (
                  <select
                    className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                    value={eventForm.status}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, status: inputEvent.target.value as EventStatus }))}
                  >
                    {(editingEventId ? editableEventStatuses : creatableEventStatuses).map((status) => (
                      <option key={status} value={status}>
                        {eventStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <div className="rounded-[20px] border border-black/8 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0d0d0d]">Ticket tiers</h3>
                    <p className="mt-1 text-xs leading-5 text-[#666666]">
                      Set prices for Regular, VIP, or Tables. If every price is empty, the event is free.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4">
                  {EVENT_TICKET_TIER_NAMES.map((name) => {
                    const tier = eventForm.ticketTiers[name];

                    return (
                      <div key={name} className="rounded-2xl bg-[#fafafa] p-3">
                        <p className="text-sm font-semibold text-[#0d0d0d]">{name}</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                            Price (₦)
                            <input
                              className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                              min="0"
                              step="100"
                              type="number"
                              placeholder="Free"
                              value={tier.priceNaira}
                              onChange={(inputEvent) =>
                                setEventForm((current) => ({
                                  ...current,
                                  ticketTiers: {
                                    ...current.ticketTiers,
                                    [name]: {
                                      ...current.ticketTiers[name],
                                      priceNaira: inputEvent.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                            Capacity
                            <input
                              className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                              min="1"
                              step="1"
                              type="number"
                              placeholder="Capacity"
                              value={tier.capacity}
                              onChange={(inputEvent) =>
                                setEventForm((current) => ({
                                  ...current,
                                  ticketTiers: {
                                    ...current.ticketTiers,
                                    [name]: {
                                      ...current.ticketTiers[name],
                                      capacity: inputEvent.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                          </label>
                          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                            Max
                            <input
                              className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                              min="1"
                              step="1"
                              type="number"
                              placeholder="Max"
                              value={tier.maxTicketsPerUser}
                              onChange={(inputEvent) =>
                                setEventForm((current) => ({
                                  ...current,
                                  ticketTiers: {
                                    ...current.ticketTiers,
                                    [name]: {
                                      ...current.ticketTiers[name],
                                      maxTicketsPerUser: inputEvent.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSavingEvent || isUploadingCoverImage}
            >
              {isSavingEvent || isUploadingCoverImage ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {isUploadingCoverImage ? "Uploading image" : editingEventId ? "Save event" : "Create event"}
            </button>
            {editingEvent && canCancelEditingEvent ? (
              <button
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-red-200 px-5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => {
                  setCancellationReason("");
                  setPendingCancelEvent(editingEvent);
                }}
                disabled={isSavingEvent || isUploadingCoverImage || isCancellingEvent}
              >
                Cancel event
              </button>
            ) : null}
          </form>
        </div>

        {pendingCancelEvent ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
            <section className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[#0d0d0d]">Cancel event?</h2>
                  <p className="mt-2 text-sm leading-6 text-[#666666]">
                    &quot;{pendingCancelEvent.title}&quot; will move to inactive events. Paid tickets will remain on record.
                  </p>
                </div>
                <button
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
                  type="button"
                  onClick={() => {
                    setPendingCancelEvent(null);
                    setCancellationReason("");
                  }}
                  disabled={isCancellingEvent}
                  aria-label="Close confirmation"
                  title="Close"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              {pendingCancelImpact ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-[#fafafa] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Paid</p>
                    <p className="mt-1 text-lg font-semibold text-[#0d0d0d]">{pendingCancelImpact.paidTickets}</p>
                  </div>
                  <div className="rounded-2xl bg-[#fafafa] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Reserved</p>
                    <p className="mt-1 text-lg font-semibold text-[#0d0d0d]">{pendingCancelImpact.activeReservations}</p>
                  </div>
                  <div className="rounded-2xl bg-[#fafafa] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Paid total</p>
                    <p className="mt-1 truncate text-sm font-semibold text-[#0d0d0d]">{formatPrice(pendingCancelImpact.totalPaidAmountKobo)}</p>
                  </div>
                </div>
              ) : null}

              {pendingCancelImpact && pendingCancelImpact.paidTickets > 0 ? (
                <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm leading-6 text-red-700">
                  This event has paid attendees. Refunds must be handled manually for now, and attendees will be told they will be contacted by email.
                </p>
              ) : null}

              <label className="mt-4 grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Cancellation reason
                <textarea
                  className="min-h-24 rounded-2xl border border-black/8 px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                  value={cancellationReason}
                  onChange={(inputEvent) => setCancellationReason(inputEvent.target.value.slice(0, EVENT_CANCELLATION_REASON_MAX_LENGTH))}
                  placeholder="Tell attendees why the event is being cancelled."
                  disabled={isCancellingEvent}
                  maxLength={EVENT_CANCELLATION_REASON_MAX_LENGTH}
                />
                <span className="text-right text-[11px] font-medium normal-case tracking-normal text-[#999999]">
                  {cancellationReason.length}/{EVENT_CANCELLATION_REASON_MAX_LENGTH}
                </span>
              </label>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => {
                    setPendingCancelEvent(null);
                    setCancellationReason("");
                  }}
                  disabled={isCancellingEvent}
                >
                  Keep event
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => void cancelEvent(pendingCancelEvent)}
                  disabled={!canConfirmCancellation}
                >
                  {isCancellingEvent ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Cancel event
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  if (isAdmin) {
    return (
      <section>
        <ScreenHeader
          eyebrow="Events"
          title=""
          action={
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-full border border-black/8 px-3 text-sm font-medium"
                type="button"
                onClick={() => router.push("/admin/raffles")}
              >
                <Gift className="size-3.5" aria-hidden="true" />
                Raffles
              </button>
              <button
                className="hidden h-9 items-center gap-2 rounded-full border border-black/8 px-3 text-sm font-medium md:inline-flex"
                type="button"
                onClick={() => loadEvents()}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Refresh
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white"
                type="button"
                onClick={startCreateEvent}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Create Event
              </button>
            </div>
          }
        />

        <div className="px-5 pb-24 md:px-8 md:pb-8">
          <div className="mb-4 grid grid-cols-2 rounded-full border border-black/5 bg-[#fafafa] p-1 text-sm font-medium md:max-w-sm">
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${adminEventListMode === "active" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setAdminEventListMode("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${adminEventListMode === "inactive" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setAdminEventListMode("inactive")}
            >
              Inactive
            </button>
          </div>

          {notice ? <p className="mb-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

          {isLoadingEvents ? (
            <LoadingState label="Loading events" className="min-h-90 rounded-3xl border border-black/5" />
          ) : adminVisibleEvents.length > 0 ? (
            <div className="grid gap-3">
              {adminVisibleEvents.map((event) => {
                const eventCategory = normalizeEventCategory(event.category);

                return (
                  <article
                    key={event.id}
                    className={`rounded-3xl border p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${isAdminInactiveEvent(event) ? "border-black/[0.03] bg-[#fafafa] opacity-70" : "border-black/5 bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{event.title}</h2>
                          {eventCategory ? (
                            <span className="rounded-full bg-[#f2f2f2] px-2.5 py-1 text-xs font-medium text-[#555555]">
                              {eventCategory}
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${getAdminEventStatusClass(event)}`}
                          >
                            {getAdminEventStatusLabel(event)}
                          </span>
                        </div>
                        <p className="mt-1 flex items-center gap-2 text-sm text-[#666666]">
                          <CalendarDays className="size-4" aria-hidden="true" />
                          {formatEventDate(event.startsAt)}
                        </p>
                        <p className="mt-1 text-sm text-[#666666]">
                          {formatEventLocation(event)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
                          <span className="rounded-full bg-[#fafafa] px-3 py-1">
                            {getTicketTypeSummary(event)}
                          </span>
                          <span className="rounded-full bg-[#fafafa] px-3 py-1">
                            {event.attendeeCount ?? getEventTicketTypes(event).reduce((total, ticketType) => total + ticketType.soldCount, 0)} booked
                          </span>
                          <span className="rounded-full bg-[#fafafa] px-3 py-1">
                            {event.reservationCount ?? 0} active reservations
                          </span>
                          <span className="rounded-full bg-[#fafafa] px-3 py-1">
                            {getTotalTicketCapacity(event)} capacity
                          </span>
                        </div>
                      </div>
                      <div className="grid shrink-0 gap-2">
                        <button
                          className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
                          type="button"
                          onClick={() => startEditEvent(event)}
                          aria-label={`Edit ${event.title}`}
                          title="Edit"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
              <div>
                <Ticket className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
                <h2 className="mt-3 text-2xl font-semibold">
                  {adminEventListMode === "inactive" ? "No inactive events" : "No active events"}
                </h2>
                <p className="mt-2 text-sm text-[#666666]">
                  {adminEventListMode === "inactive"
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

  return (
    <section>
      <ScreenHeader
        eyebrow="Events"
        title=""
        action={
          eventViewMode === "events" ? (
            <button
              className={`relative inline-flex size-10 items-center justify-center rounded-full border text-[#0d0d0d] ${hasEventLocationFilter ? "border-[#bd40be] bg-[#f6e0f6]" : "border-black/8 bg-white"
                }`}
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
          ) : undefined
        }
      />

      {isEventFilterOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-4 backdrop-blur-sm sm:p-5">
          <button
            className="absolute inset-0"
            type="button"
            onClick={() => setIsEventFilterOpen(false)}
            aria-label="Close filters"
          />
          <div
            className="relative w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
            role="dialog"
            aria-modal="true"
            aria-label="Event filters"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Filters</p>
                <h2 className="mt-1 text-xl font-semibold text-[#0d0d0d]">Location</h2>
              </div>
              <button
                className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
                type="button"
                onClick={() => setIsEventFilterOpen(false)}
                aria-label="Close filters"
              >
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
                  {nigeriaStateNames.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
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
                  {eventFilterCityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
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
              <button
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white"
                type="button"
                onClick={() => setIsEventFilterOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ticketModalEvent ? (() => {
        const ticketTypes = getEventTicketTypes(ticketModalEvent);
        const ticketType = getSelectedTicketType(ticketModalEvent, selectedTicketTypeIds[ticketModalEvent.id]);
        const maxPurchaseQuantity = ticketType
          ? isGuest
            ? Math.min(ticketType.availableCount, MAX_TICKETS_PER_PURCHASE)
            : getMaxPurchaseQuantity(ticketModalEvent, ticketType)
          : 0;
        const selectedQuantity = maxPurchaseQuantity > 0
          ? Math.min(Math.max(1, bookingQuantities[ticketModalEvent.id] ?? 1), maxPurchaseQuantity)
          : 1;
        const quantityOptions = maxPurchaseQuantity > 0
          ? Array.from({ length: maxPurchaseQuantity }, (_, index) => index + 1)
          : [1];
        const isBusy = activeEventId === ticketModalEvent.id;
        const isSoldOut = Boolean(ticketType && ticketType.availableCount <= 0);
        const isLimitReached = Boolean(ticketType && isMemberBookableEvent(ticketModalEvent) && !isSoldOut && maxPurchaseQuantity <= 0);
        const isPaidEvent = Boolean(ticketType && ticketType.priceKobo > 0);
        const purchaseNoun = isPaidEvent ? "ticket" : "spot";
        const purchaseNounPlural = isPaidEvent ? "tickets" : "spots";
        const selectedNoun = selectedQuantity === 1 ? purchaseNoun : purchaseNounPlural;
        const statusCopy = !ticketType
          ? "No ticket tiers are available for this event."
          : isSoldOut
            ? "This tier is sold out."
            : isLimitReached
              ? "You have reached the ticket limit for this tier."
              : !isMemberBookableEvent(ticketModalEvent)
                ? "This event is unavailable."
                : null;

        return (
          <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-4 backdrop-blur-sm sm:p-5">
            <button
              className="absolute inset-0"
              type="button"
              onClick={() => setTicketModalEventId(null)}
              aria-label="Close ticket selector"
            />
            <section
              className="relative w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="event-ticket-modal-title"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Tickets</p>
                  <h2 id="event-ticket-modal-title" className="mt-1 truncate text-xl font-semibold text-[#0d0d0d]">
                    {ticketModalEvent.title}
                  </h2>
                  <p className="mt-1 text-sm text-[#666666]">{formatEventDate(ticketModalEvent.startsAt)}</p>
                </div>
                <button
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
                  type="button"
                  onClick={() => setTicketModalEventId(null)}
                  aria-label="Close ticket selector"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Tier
                  <select
                    className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be] disabled:bg-[#fafafa] disabled:text-[#999999]"
                    value={ticketType?.id ?? ""}
                    onChange={(inputEvent) => {
                      setSelectedTicketTypeIds((current) => ({ ...current, [ticketModalEvent.id]: inputEvent.target.value }));
                      setBookingQuantities((current) => ({ ...current, [ticketModalEvent.id]: 1 }));
                    }}
                    disabled={isBusy || ticketTypes.length <= 1}
                  >
                    {ticketTypes.length > 0 ? (
                      ticketTypes.map((availableTicketType) => (
                        <option key={availableTicketType.id} value={availableTicketType.id}>
                          {normalizeTicketTierName(availableTicketType.name)} · {formatPrice(availableTicketType.priceKobo)}
                        </option>
                      ))
                    ) : (
                      <option value="">No tickets available</option>
                    )}
                  </select>
                </label>

                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Quantity
                  <select
                    className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be] disabled:bg-[#fafafa] disabled:text-[#999999]"
                    value={selectedQuantity}
                    onChange={(inputEvent) =>
                      setBookingQuantities((current) => ({ ...current, [ticketModalEvent.id]: Number(inputEvent.target.value) }))
                    }
                    disabled={isBusy || maxPurchaseQuantity <= 0}
                  >
                    {quantityOptions.map((quantity) => (
                      <option key={quantity} value={quantity}>
                        {quantity} {quantity === 1 ? purchaseNoun : purchaseNounPlural}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {statusCopy ? (
                <p className="mt-4 rounded-2xl bg-[#fff4d9] p-3 text-sm font-medium text-[#9a6a12]">{statusCopy}</p>
              ) : null}

              <button
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={!ticketType || maxPurchaseQuantity <= 0 || isBusy}
                onClick={() => void bookEvent(ticketModalEvent, ticketType, selectedQuantity)}
              >
                {isBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                {isPaidEvent ? `Buy ${selectedQuantity} ${selectedNoun}` : `Book ${selectedQuantity} ${selectedNoun}`}
              </button>
            </section>
          </div>
        );
      })() : null}

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {!isGuest ? (
          <div className="mb-4 grid grid-cols-4 rounded-full border border-black/5 bg-[#fafafa] p-1 text-sm font-medium md:max-w-md">
            <button
              type="button"
              className={`rounded-full px-3 py-2 ${eventViewMode === "tickets" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setEventViewMode("tickets")}
            >
              Tickets
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-2 ${eventViewMode === "events" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setEventViewMode("events")}
            >
              Events
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-2 ${eventViewMode === "history" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setEventViewMode("history")}
            >
              History
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-2 ${eventViewMode === "raffles" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setEventViewMode("raffles")}
            >
              Raffles
            </button>
          </div>
        ) : null}

        {eventViewMode === "raffles" ? (
          <RafflesList token={token ?? null} />
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
                  <span
                    className={`grid size-14 place-items-center rounded-full border ${eventFilterCategory ? "border-black/8 bg-white" : "border-[#bd40be] bg-[#f6e0f6]"}`}
                  >
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
                      <span
                        className={`grid size-14 place-items-center rounded-full border ${isActiveCategory ? "border-[#bd40be] bg-[#f6e0f6]" : "border-black/8 bg-white"}`}
                      >
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
              <LoadingState label="Loading events" className="min-h-90 rounded-3xl border border-black/5" />
            ) : visibleMemberEvents.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleMemberEvents.map((event) => {
                  const ticketTypes = getEventTicketTypes(event);
                  const ticketType = getSelectedTicketType(event, selectedTicketTypeIds[event.id]);
                  const ownedTicketTypeIds = getOwnedTicketTypeIds(event);
                  const isTicketCard = eventViewMode === "tickets";
                  const isHistoryCard = eventViewMode === "history";
                  const isOwnedEventCard = isTicketCard || isHistoryCard;
                  const maxPurchaseQuantity = getMaxPurchaseQuantity(event, ticketType);
                  const canBookMore = maxPurchaseQuantity > 0;
                  const isSoldOut = Boolean(ticketType && ticketType.availableCount <= 0);
                  const isLimitReached = Boolean(ticketType && isMemberBookableEvent(event) && !isSoldOut && maxPurchaseQuantity <= 0);
                  const isBusy = activeEventId === event.id;
                  const getTicketsLabel = isSoldOut
                    ? "Sold out"
                    : isLimitReached
                      ? "Ticket limit reached"
                      : !isMemberBookableEvent(event)
                        ? "Event unavailable"
                        : "Get Tickets";

                  return (
                    <article
                      key={event.id}
                      className={`overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${isOwnedEventCard ? "cursor-pointer transition hover:border-[#bd40be]/30 hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)]" : ""}`}
                      role={isOwnedEventCard ? "button" : undefined}
                      tabIndex={isOwnedEventCard ? 0 : undefined}
                      onClick={isOwnedEventCard ? () => router.push(`/events/${event.id}`) : undefined}
                      onKeyDown={
                        isOwnedEventCard
                          ? (keyboardEvent) => {
                            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                              keyboardEvent.preventDefault();
                              router.push(`/events/${event.id}`);
                            }
                          }
                          : undefined
                      }
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
                            void shareEvent(event);
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
                              router.push(`/events/${event.id}`);
                              return;
                            }

                            setTicketModalEventId(event.id);
                          }}
                        >
                          {isBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                          {isHistoryCard ? "View details" : isTicketCard ? "View tickets" : getTicketsLabel}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
                <div>
                  <Ticket className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
                  <h2 className="mt-3 text-2xl font-semibold">{emptyMemberTitle}</h2>
                  <p className="mt-2 text-sm text-[#666666]">{emptyMemberDescription}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
