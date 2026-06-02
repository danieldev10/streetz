"use client";

import Image from "next/image";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ImagePlus, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Save, SlidersHorizontal, Ticket, X } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { EVENT_IMAGE_UPLOAD_MAX_BYTES, prepareImageForUpload } from "@/lib/image-upload";
import { getCitiesForState, nigeriaStateNames } from "@/lib/nigeria-locations";
import type { EventStatus, StreetzEvent, StreetzProfile, StreetzUser, TicketStatus } from "@/lib/types";

const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80";
const GENERAL_ADMISSION_TICKET_NAME = "General Admission";
const SUPPORTED_EVENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const CONFIRMED_TICKET_STATUSES = new Set<TicketStatus>(["PAID", "CHECKED_IN"]);
const EVENT_TITLE_MAX_LENGTH = 120;
const EVENT_DESCRIPTION_MAX_LENGTH = 600;
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

type EventViewMode = "tickets" | "events";
type AdminEventView = "list" | "form";
type AdminEventMode = "list" | "create" | "edit";
type AdminEventListMode = "active" | "inactive";

type EventForm = {
  title: string;
  description: string;
  coverImage: string;
  venue: string;
  state: string;
  city: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  priceNaira: string;
  capacity: string;
  maxTicketsPerUser: string;
};

type EventImageUploadResponse = {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresInSeconds: number;
};

const emptyEventForm: EventForm = {
  title: "",
  description: "",
  coverImage: "",
  venue: "",
  state: "",
  city: "",
  startsAt: "",
  endsAt: "",
  status: "DRAFT",
  priceNaira: "0",
  capacity: "100",
  maxTicketsPerUser: "4",
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

function hasConfirmedTicket(event: StreetzEvent) {
  return getUserTickets(event).some((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status));
}

function getUserTickets(event: StreetzEvent) {
  return event.userTickets ?? (event.userTicket ? [event.userTicket] : []);
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
    return "bg-[#d4fae8] text-[#0fa76e]";
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
  const paidTickets = event.attendeeCount ?? event.ticketType?.soldCount ?? 0;
  const activeReservations = event.reservationCount ?? event.ticketType?.reservedCount ?? 0;
  const totalPaidAmountKobo = event.totalPaidAmountKobo ?? paidTickets * (event.ticketType?.priceKobo ?? 0);

  return { activeReservations, paidTickets, totalPaidAmountKobo };
}

function getRemainingUserTicketAllowance(event: StreetzEvent) {
  const maxTicketsPerUser = event.ticketType?.maxTicketsPerUser ?? 1;
  const ownedTickets = getUserTickets(event).filter((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status)).length;

  return Math.max(0, maxTicketsPerUser - ownedTickets);
}

function getMaxPurchaseQuantity(event: StreetzEvent) {
  if (!event.ticketType || !isMemberBookableEvent(event)) {
    return 0;
  }

  return Math.max(0, Math.min(event.ticketType.availableCount, getRemainingUserTicketAllowance(event), MAX_TICKETS_PER_PURCHASE));
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

function getEventForm(event: StreetzEvent): EventForm {
  return {
    title: event.title,
    description: event.description ?? "",
    coverImage: event.coverImage ?? "",
    venue: event.venue,
    state: event.state ?? findEventStateForCity(event.city) ?? "",
    city: event.city,
    startsAt: toDateTimeLocal(event.startsAt),
    endsAt: toDateTimeLocal(event.endsAt),
    status: event.status,
    priceNaira: String((event.ticketType?.priceKobo ?? 0) / 100),
    capacity: String(event.ticketType?.capacity ?? 100),
    maxTicketsPerUser: String(event.ticketType?.maxTicketsPerUser ?? 4),
  };
}

export function EventsTab({
  token,
  user,
  adminMode = "list",
  adminEventId = null,
}: {
  token: string;
  user: StreetzUser;
  adminMode?: AdminEventMode;
  adminEventId?: string | null;
}) {
  const router = useRouter();
  const isAdmin = user.role === "ADMIN";
  const [events, setEvents] = useState<StreetzEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventViewMode, setEventViewMode] = useState<EventViewMode>("events");
  const viewModeInitializedRef = useRef(false);
  const filterInitializedRef = useRef(false);
  const [adminEventView, setAdminEventView] = useState<AdminEventView>(adminMode === "list" ? "list" : "form");
  const [editingEventId, setEditingEventId] = useState<string | null>(adminMode === "edit" ? adminEventId : null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [eventFilterState, setEventFilterState] = useState("");
  const [eventFilterCity, setEventFilterCity] = useState("");
  const [isEventFilterOpen, setIsEventFilterOpen] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [bookingQuantities, setBookingQuantities] = useState<Record<string, number>>({});
  const [adminEventListMode, setAdminEventListMode] = useState<AdminEventListMode>("active");
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false);
  const [pendingCancelEvent, setPendingCancelEvent] = useState<StreetzEvent | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancellingEvent, setIsCancellingEvent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const orderedEvents = useMemo(
    () => [...events].sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
    [events]
  );
  const adminActiveEvents = useMemo(() => orderedEvents.filter((event) => !isAdminInactiveEvent(event)), [orderedEvents]);
  const adminInactiveEvents = useMemo(() => orderedEvents.filter(isAdminInactiveEvent), [orderedEvents]);
  const adminVisibleEvents = adminEventListMode === "inactive" ? adminInactiveEvents : adminActiveEvents;
  const editingEvent = useMemo(
    () => events.find((event) => event.id === editingEventId) ?? null,
    [editingEventId, events]
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
    () => eventViewMode === "tickets" ? ticketEvents : exploreEvents,
    [eventViewMode, exploreEvents, ticketEvents]
  );
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
    if (eventViewMode === "tickets") {
      return memberEventsForMode;
    }

    return memberEventsForMode.filter((event) => {
      if (eventFilterState && getEventState(event) !== eventFilterState) {
        return false;
      }

      if (eventFilterCity && event.city !== eventFilterCity) {
        return false;
      }

      return true;
    });
  }, [eventFilterCity, eventFilterState, eventViewMode, memberEventsForMode]);
  const hasEventLocationFilter = Boolean(eventFilterState || eventFilterCity);
  const emptyMemberTitle = eventViewMode === "tickets"
    ? "No tickets yet"
    : hasEventLocationFilter
      ? "No events found"
      : "No events yet";
  const emptyMemberDescription = eventViewMode === "tickets"
    ? "Tickets you book or buy will appear here."
    : hasEventLocationFilter
      ? "Try another state or city."
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
      const fetchProfile = !filterInitializedRef.current && !isAdmin;
      const [eventsResult, profileResult] = await Promise.all([
        apiRequest<{ events: StreetzEvent[] }>(isAdmin ? "/admin/events" : "/events", {
          headers: authHeaders(token),
        }),
        fetchProfile
          ? apiRequest<StreetzProfile | null>("/profiles/me", { headers: authHeaders(token) }).catch(() => null)
          : Promise.resolve(null)
      ]);

      setEvents(eventsResult.events);

      if (!isAdmin && !viewModeInitializedRef.current) {
        viewModeInitializedRef.current = true;
        setEventViewMode(eventsResult.events.some(hasConfirmedTicket) ? "tickets" : "events");
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
        headers: authHeaders(token),
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

    const priceNaira = Number(eventForm.priceNaira || 0);
    const capacity = Number(eventForm.capacity || 0);
    const maxTicketsPerUser = Number(eventForm.maxTicketsPerUser || 0);
    const title = eventForm.title.trim();
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

    if (!Number.isFinite(priceNaira) || priceNaira < 0) {
      setNotice("Ticket price must be zero or higher.");
      setIsSavingEvent(false);
      return;
    }

    if (!Number.isInteger(capacity) || capacity < 1) {
      setNotice("Capacity must be at least 1.");
      setIsSavingEvent(false);
      return;
    }

    if (!Number.isInteger(maxTicketsPerUser) || maxTicketsPerUser < 1) {
      setNotice("Max tickets per person must be at least 1.");
      setIsSavingEvent(false);
      return;
    }

    if (maxTicketsPerUser > capacity) {
      setNotice("Max tickets per person cannot be greater than event capacity.");
      setIsSavingEvent(false);
      return;
    }

    const payload = {
      title,
      description,
      coverImage: eventForm.coverImage,
      venue,
      state,
      city,
      startsAt: new Date(startsAtTime).toISOString(),
      endsAt: endsAtTime !== null ? new Date(endsAtTime).toISOString() : undefined,
      status: eventForm.status,
      priceKobo: Math.round(priceNaira * 100),
      capacity,
      maxTicketsPerUser,
    };

    try {
      const savedEvent = await apiRequest<StreetzEvent>(
        editingEventId ? `/admin/events/${editingEventId}` : "/admin/events",
        {
          method: editingEventId ? "PUT" : "POST",
          headers: authHeaders(token),
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

  async function bookEvent(event: StreetzEvent, quantity = 1) {
    if (!event.ticketType || !isMemberBookableEvent(event) || event.ticketType.availableCount <= 0) {
      return;
    }

    const maxQuantity = getMaxPurchaseQuantity(event);
    const safeQuantity = Math.max(1, Math.min(quantity, maxQuantity));

    if (safeQuantity < 1) {
      return;
    }

    setActiveEventId(event.id);
    setNotice(null);

    try {
      if (event.ticketType.priceKobo <= 0) {
        const updatedEvent = await apiRequest<StreetzEvent>(`/events/${event.id}/book`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ quantity: safeQuantity }),
        });
        setEvents((current) => current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)));
        setBookingQuantities((current) => ({ ...current, [event.id]: 1 }));
        setNotice(safeQuantity === 1 ? "Spot booked." : `${safeQuantity} spots booked.`);
        return;
      }

      const response = await apiRequest<{
        authorizationUrl?: string;
      }>(`/payments/events/${event.id}/ticket/initialize`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ quantity: safeQuantity }),
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
        headers: authHeaders(token),
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
          {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

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
                className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Event title"
                value={eventForm.title}
                onChange={(inputEvent) => setEventForm((current) => ({ ...current, title: inputEvent.target.value }))}
                minLength={2}
                maxLength={EVENT_TITLE_MAX_LENGTH}
                required
              />
              <textarea
                className="min-h-28 rounded-[18px] border border-black/8 p-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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
                      <ImagePlus className="mx-auto mb-2 size-7 text-[#18E299]" aria-hidden="true" />
                      Upload an event cover image
                    </div>
                  )}
                  {isUploadingCoverImage ? (
                    <div className="absolute inset-0 grid place-items-center bg-white/70">
                      <LoaderCircle className="size-7 animate-spin text-[#18E299]" aria-hidden="true" />
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
                  className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  placeholder="Venue"
                  value={eventForm.venue}
                  onChange={(inputEvent) => setEventForm((current) => ({ ...current, venue: inputEvent.target.value }))}
                  minLength={2}
                  maxLength={EVENT_VENUE_MAX_LENGTH}
                  required
                />
                <select
                  className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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
                className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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
                    className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    type="datetime-local"
                    value={eventForm.startsAt}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, startsAt: inputEvent.target.value }))}
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Ends
                  <input
                    className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    type="datetime-local"
                    value={eventForm.endsAt}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, endsAt: inputEvent.target.value }))}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Ticket name
                  <div className="flex h-12 items-center rounded-full border border-black/8 bg-[#fafafa] px-4 text-sm font-medium normal-case tracking-normal text-[#666666]">
                    {GENERAL_ADMISSION_TICKET_NAME}
                  </div>
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Status
                  {isEditingLockedEvent && editingEvent ? (
                    <div className="flex h-12 items-center rounded-full border border-black/8 bg-[#fafafa] px-4 text-sm font-medium normal-case tracking-normal text-[#666666]">
                      {eventStatusLabels[editingEvent.status === "PUBLISHED" && hasEventEnded(editingEvent) ? "COMPLETED" : editingEvent.status]}
                    </div>
                  ) : (
                    <select
                      className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Price (₦)
                  <input
                    className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    min="0"
                    step="100"
                    type="number"
                    placeholder="Price in naira"
                    value={eventForm.priceNaira}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, priceNaira: inputEvent.target.value }))}
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Capacity
                  <input
                    className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    min="1"
                    step="1"
                    type="number"
                    placeholder="Capacity"
                    value={eventForm.capacity}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, capacity: inputEvent.target.value }))}
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Max per person
                  <input
                    className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    min="1"
                    step="1"
                    type="number"
                    placeholder="Max tickets per member"
                    value={eventForm.maxTicketsPerUser}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, maxTicketsPerUser: inputEvent.target.value }))}
                    required
                  />
                </label>
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
                  className="min-h-24 rounded-2xl border border-black/8 px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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

          {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          {isLoadingEvents ? (
            <LoadingState label="Loading events" className="min-h-90 rounded-3xl border border-black/5" />
          ) : adminVisibleEvents.length > 0 ? (
            <div className="grid gap-3">
              {adminVisibleEvents.map((event) => (
                <article
                  key={event.id}
                  className={`rounded-3xl border p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${isAdminInactiveEvent(event) ? "border-black/[0.03] bg-[#fafafa] opacity-70" : "border-black/5 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{event.title}</h2>
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
                          {event.ticketType ? formatPrice(event.ticketType.priceKobo) : "No ticket"}
                        </span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">
                          {event.attendeeCount ?? event.ticketType?.soldCount ?? 0} booked
                        </span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">
                          {event.reservationCount ?? 0} active reservations
                        </span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">
                          {event.ticketType?.capacity ?? 0} capacity
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
              ))}
            </div>
          ) : (
            <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
              <div>
                <Ticket className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
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
              className={`relative inline-flex size-10 items-center justify-center rounded-full border text-[#0d0d0d] ${hasEventLocationFilter ? "border-[#18E299] bg-[#d4fae8]" : "border-black/8 bg-white"
                }`}
              type="button"
              onClick={() => setIsEventFilterOpen(true)}
              aria-label="Filter events"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {hasEventLocationFilter ? (
                <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#18E299] text-[9px] font-semibold text-[#0d0d0d]">
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
                  className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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
                  className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299] disabled:bg-[#fafafa] disabled:text-[#999999]"
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

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className="mb-4 grid grid-cols-2 rounded-full border border-black/5 bg-[#fafafa] p-1 text-sm font-medium md:max-w-sm">
          <button
            type="button"
            className={`rounded-full px-4 py-2 ${eventViewMode === "tickets" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
            onClick={() => setEventViewMode("tickets")}
          >
            Tickets
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 ${eventViewMode === "events" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
            onClick={() => setEventViewMode("events")}
          >
            Events
          </button>
        </div>

        {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingEvents ? (
          <LoadingState label="Loading events" className="min-h-90 rounded-3xl border border-black/5" />
        ) : visibleMemberEvents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleMemberEvents.map((event) => {
              const ticketType = event.ticketType;
              const isBooked = getUserTickets(event).some((ticket) => CONFIRMED_TICKET_STATUSES.has(ticket.status));
              const maxPurchaseQuantity = getMaxPurchaseQuantity(event);
              const selectedQuantity = maxPurchaseQuantity > 0
                ? Math.min(Math.max(1, bookingQuantities[event.id] ?? 1), maxPurchaseQuantity)
                : 1;
              const quantityOptions = Array.from({ length: maxPurchaseQuantity }, (_, index) => index + 1);
              const canBookMore = maxPurchaseQuantity > 0;
              const isSoldOut = Boolean(ticketType && ticketType.availableCount <= 0);
              const isLimitReached = Boolean(ticketType && isMemberBookableEvent(event) && !isSoldOut && maxPurchaseQuantity <= 0);
              const isBusy = activeEventId === event.id;
              const isTicketCard = eventViewMode === "tickets";
              const isPaidEvent = Boolean(ticketType && ticketType.priceKobo > 0);
              const purchaseNoun = isPaidEvent ? "ticket" : "spot";
              const purchaseNounPlural = isPaidEvent ? "tickets" : "spots";
              const selectedNoun = selectedQuantity === 1 ? purchaseNoun : purchaseNounPlural;

              return (
                <article
                  key={event.id}
                  className={`overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${isTicketCard ? "cursor-pointer transition hover:border-[#18E299]/30 hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)]" : ""}`}
                  role={isTicketCard ? "button" : undefined}
                  tabIndex={isTicketCard ? 0 : undefined}
                  onClick={isTicketCard ? () => router.push(`/events/${event.id}`) : undefined}
                  onKeyDown={
                    isTicketCard
                      ? (keyboardEvent) => {
                        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                          keyboardEvent.preventDefault();
                          router.push(`/events/${event.id}`);
                        }
                      }
                      : undefined
                  }
                >
                  <div className="relative aspect-16/11 bg-[#d4fae8]">
                    <Image
                      src={event.coverImage || FALLBACK_EVENT_IMAGE}
                      alt={`${event.title} event`}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      {formatEventDate(event.startsAt)}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">{event.title}</h2>
                    <p className="mt-1 flex items-center gap-1 text-sm text-[#666666]">
                      <MapPin className="size-4" aria-hidden="true" />
                      {formatEventLocation(event)}
                    </p>
                    {!isTicketCard && canBookMore && maxPurchaseQuantity > 1 ? (
                      <label
                        className="mt-4 grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]"
                        onClick={(clickEvent) => clickEvent.stopPropagation()}
                      >
                        Quantity
                        <select
                          className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                          value={selectedQuantity}
                          onChange={(inputEvent) =>
                            setBookingQuantities((current) => ({ ...current, [event.id]: Number(inputEvent.target.value) }))
                          }
                          disabled={isBusy}
                        >
                          {quantityOptions.map((quantity) => (
                            <option key={quantity} value={quantity}>
                              {quantity} {quantity === 1 ? purchaseNoun : purchaseNounPlural}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <button
                      className={`${!isTicketCard && canBookMore && maxPurchaseQuantity > 1 ? "mt-3" : "mt-4"} inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60`}
                      type="button"
                      disabled={!isTicketCard && (!ticketType || !canBookMore || isBusy)}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        if (isTicketCard) {
                          router.push(`/events/${event.id}`);
                          return;
                        }

                        void bookEvent(event, selectedQuantity);
                      }}
                    >
                      {isBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                      {isTicketCard
                        ? "View tickets"
                        : isSoldOut
                          ? "Sold out"
                          : isLimitReached
                            ? "Ticket limit reached"
                            : !isMemberBookableEvent(event)
                              ? "Event unavailable"
                              : isBooked && selectedQuantity === 1
                                ? `${isPaidEvent ? "Buy" : "Book"} another ${purchaseNoun}`
                                : isBooked
                                  ? `${isPaidEvent ? "Buy" : "Book"} ${selectedQuantity} more ${purchaseNounPlural}`
                                  : `${isPaidEvent ? "Buy" : "Book"} ${selectedQuantity} ${selectedNoun}`}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
            <div>
              <Ticket className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">{emptyMemberTitle}</h2>
              <p className="mt-2 text-sm text-[#666666]">{emptyMemberDescription}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
