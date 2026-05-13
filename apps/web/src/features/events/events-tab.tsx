"use client";

import Image from "next/image";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ImagePlus, LoaderCircle, MapPin, Pencil, Plus, Power, RefreshCw, Save, Ticket } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { apiRequest, authHeaders } from "@/lib/api";
import type { EventStatus, StreetzEvent, StreetzUser } from "@/lib/types";

const FALLBACK_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80";
const GENERAL_ADMISSION_TICKET_NAME = "General Admission";
const SUPPORTED_EVENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type AdminEventView = "list" | "form";
type AdminEventMode = "list" | "create" | "edit";

type EventForm = {
  title: string;
  description: string;
  coverImage: string;
  venue: string;
  city: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  priceNaira: string;
  capacity: string;
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
  city: "",
  startsAt: "",
  endsAt: "",
  status: "DRAFT",
  priceNaira: "0",
  capacity: "100",
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
    city: event.city,
    startsAt: toDateTimeLocal(event.startsAt),
    endsAt: toDateTimeLocal(event.endsAt),
    status: event.status,
    priceNaira: String((event.ticketType?.priceKobo ?? 0) / 100),
    capacity: String(event.ticketType?.capacity ?? 100),
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
  const [adminEventView, setAdminEventView] = useState<AdminEventView>(adminMode === "list" ? "list" : "form");
  const [editingEventId, setEditingEventId] = useState<string | null>(adminMode === "edit" ? adminEventId : null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const orderedEvents = useMemo(
    () => [...events].sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
    [events]
  );

  async function loadEvents(options: { clearNotice?: boolean; showLoading?: boolean } = {}) {
    const { clearNotice = true, showLoading = true } = options;

    if (showLoading) {
      setIsLoadingEvents(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const response = await apiRequest<{ events: StreetzEvent[] }>(isAdmin ? "/admin/events" : "/events", {
        headers: authHeaders(token),
      });
      setEvents(response.events);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load events.");
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
      setEditingEventId(adminMode === "edit" ? adminEventId : null);
      setEventForm(emptyEventForm);
      setNotice(null);
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

    setIsUploadingCoverImage(true);
    setNotice(null);

    try {
      const upload = await apiRequest<EventImageUploadResponse>("/admin/events/images/presign", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      });

      const uploadResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("S3 rejected the event image upload. Check the bucket CORS settings.");
      }

      setEventForm((current) => ({ ...current, coverImage: upload.publicUrl }));
      setNotice("Event image uploaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload event image.";
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

    if (!eventForm.startsAt) {
      setNotice("Event start date is required.");
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

    const payload = {
      title: eventForm.title,
      description: eventForm.description,
      coverImage: eventForm.coverImage,
      venue: eventForm.venue,
      city: eventForm.city,
      startsAt: new Date(eventForm.startsAt).toISOString(),
      endsAt: eventForm.endsAt ? new Date(eventForm.endsAt).toISOString() : undefined,
      status: eventForm.status,
      priceKobo: Math.round(priceNaira * 100),
      capacity,
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
      setNotice(error instanceof Error ? error.message : "Unable to save event.");
    } finally {
      setIsSavingEvent(false);
    }
  }

  async function toggleEventStatus(event: StreetzEvent) {
    if (!isAdmin) {
      return;
    }

    setNotice(null);

    try {
      const nextStatus: EventStatus = event.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
      const updatedEvent = await apiRequest<StreetzEvent>(`/admin/events/${event.id}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ status: nextStatus }),
      });
      setEvents((current) => current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)));

      if (editingEventId === event.id) {
        setEventForm(getEventForm(updatedEvent));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update event.");
    }
  }

  async function bookEvent(event: StreetzEvent) {
    if (!event.ticketType || event.userTicket || event.ticketType.availableCount <= 0) {
      return;
    }

    setActiveEventId(event.id);
    setNotice(null);

    try {
      if (event.ticketType.priceKobo <= 0) {
        const updatedEvent = await apiRequest<StreetzEvent>(`/events/${event.id}/book`, {
          method: "POST",
          headers: authHeaders(token),
        });
        setEvents((current) => current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)));
        setNotice("Spot booked.");
        return;
      }

      const response = await apiRequest<{
        authorizationUrl?: string;
        alreadyBooked?: boolean;
      }>(`/payments/events/${event.id}/ticket/initialize`, {
        method: "POST",
        headers: authHeaders(token),
      });

      if (response.alreadyBooked) {
        setNotice("Ticket already booked.");
        void loadEvents({ clearNotice: false, showLoading: false });
        return;
      }

      if (!response.authorizationUrl) {
        throw new Error("Paystack did not return a checkout URL.");
      }

      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to book event.");
    } finally {
      setActiveEventId(null);
    }
  }

  if (isAdmin && adminEventView === "form") {
    return (
      <section>
        <ScreenHeader
          eyebrow="Events"
          title={editingEventId ? "Edit event." : "Create event."}
          leading={
            <button
              className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08]"
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
          {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          <form
            onSubmit={saveEvent}
            className="mx-auto max-w-2xl rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{editingEventId ? "Edit event" : "Create event"}</h2>
                <p className="mt-1 text-sm text-[#666666]">Publish events and set ticket pricing</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Event title"
                value={eventForm.title}
                onChange={(inputEvent) => setEventForm((current) => ({ ...current, title: inputEvent.target.value }))}
                required
              />
              <textarea
                className="min-h-28 rounded-[18px] border border-black/[0.08] p-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Description"
                value={eventForm.description}
                onChange={(inputEvent) => setEventForm((current) => ({ ...current, description: inputEvent.target.value }))}
                maxLength={600}
              />
              <div className="rounded-[20px] border border-black/[0.08] p-3">
                <div className="relative grid aspect-[16/9] place-items-center overflow-hidden rounded-[16px] bg-[#fafafa] text-center">
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
                      className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  placeholder="Venue"
                  value={eventForm.venue}
                  onChange={(inputEvent) => setEventForm((current) => ({ ...current, venue: inputEvent.target.value }))}
                  required
                />
                <input
                  className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  placeholder="City"
                  value={eventForm.city}
                  onChange={(inputEvent) => setEventForm((current) => ({ ...current, city: inputEvent.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Starts
                  <input
                    className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    type="datetime-local"
                    value={eventForm.startsAt}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, startsAt: inputEvent.target.value }))}
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Ends
                  <input
                    className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-medium normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    type="datetime-local"
                    value={eventForm.endsAt}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, endsAt: inputEvent.target.value }))}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Ticket name
                  <div className="flex h-12 items-center rounded-full border border-black/[0.08] bg-[#fafafa] px-4 text-sm font-medium normal-case tracking-normal text-[#666666]">
                    {GENERAL_ADMISSION_TICKET_NAME}
                  </div>
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Status
                  <select
                    className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    value={eventForm.status}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, status: inputEvent.target.value as EventStatus }))}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Price (₦)
                  <input
                    className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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
                    className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    min="1"
                    step="1"
                    type="number"
                    placeholder="Capacity"
                    value={eventForm.capacity}
                    onChange={(inputEvent) => setEventForm((current) => ({ ...current, capacity: inputEvent.target.value }))}
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
          </form>
        </div>
      </section>
    );
  }

  if (isAdmin) {
    return (
      <section>
        <ScreenHeader
          eyebrow="Events"
          title="Manage events."
          action={
            <button
              className="hidden h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium md:inline-flex"
              type="button"
              onClick={() => loadEvents()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </button>
          }
        />

        <div className="px-5 pb-24 md:px-8 md:pb-8">
          {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          <div className="mb-4 flex items-center justify-end">
            <button
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
              type="button"
              onClick={startCreateEvent}
            >
              <Plus className="size-4" aria-hidden="true" />
              Create Event
            </button>
          </div>

          {isLoadingEvents ? (
            <div className="grid min-h-[360px] place-items-center rounded-[24px] border border-black/[0.05]">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-[#666666]">Loading events</p>
              </div>
            </div>
          ) : orderedEvents.length > 0 ? (
            <div className="grid gap-3">
              {orderedEvents.map((event) => (
                <article
                  key={event.id}
                  className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{event.title}</h2>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${event.status === "PUBLISHED" ? "bg-[#d4fae8] text-[#0fa76e]" : "bg-[#fafafa] text-[#777777]"
                            }`}
                        >
                          {event.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-sm text-[#666666]">
                        <CalendarDays className="size-4" aria-hidden="true" />
                        {formatEventDate(event.startsAt)}
                      </p>
                      <p className="mt-1 text-sm text-[#666666]">
                        {event.venue}, {event.city}
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
                        className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08]"
                        type="button"
                        onClick={() => startEditEvent(event)}
                        aria-label={`Edit ${event.title}`}
                        title="Edit"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08]"
                        type="button"
                        onClick={() => toggleEventStatus(event)}
                        aria-label={event.status === "PUBLISHED" ? `Unpublish ${event.title}` : `Publish ${event.title}`}
                        title={event.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                      >
                        <Power className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[360px] place-items-center rounded-[24px] border border-black/[0.05] p-6 text-center">
              <div>
                <Ticket className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                <h2 className="mt-3 text-2xl font-semibold">No events yet</h2>
                <p className="mt-2 text-sm text-[#666666]">Create the first paid or free event for members.</p>
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
        title="Tickets for what is next."
        action={
          <button
            className="hidden h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium md:inline-flex"
            type="button"
            onClick={() => loadEvents()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingEvents ? (
          <div className="grid min-h-[360px] place-items-center rounded-[24px] border border-black/[0.05]">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading events</p>
            </div>
          </div>
        ) : orderedEvents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orderedEvents.map((event) => {
              const ticketType = event.ticketType;
              const isBooked = Boolean(event.userTicket && ["RESERVED", "PAID", "CHECKED_IN"].includes(event.userTicket.status));
              const isSoldOut = Boolean(ticketType && ticketType.availableCount <= 0 && !isBooked);
              const isBusy = activeEventId === event.id;

              return (
                <article
                  key={event.id}
                  className="overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
                >
                  <div className="relative aspect-[16/11] bg-[#d4fae8]">
                    <Image
                      src={event.coverImage || FALLBACK_EVENT_IMAGE}
                      alt={`${event.title} event`}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#0d0d0d]">
                      {ticketType ? formatPrice(ticketType.priceKobo) : "No ticket"}
                    </span>
                    {isBooked ? (
                      <span className="absolute right-3 top-3 rounded-full bg-[#18E299] px-3 py-1 text-xs font-semibold text-[#0d0d0d]">
                        Booked
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      {formatEventDate(event.startsAt)}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">{event.title}</h2>
                    <p className="mt-1 flex items-center gap-1 text-sm text-[#666666]">
                      <MapPin className="size-4" aria-hidden="true" />
                      {event.venue}, {event.city}
                    </p>
                    {event.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#555555]">{event.description}</p> : null}
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
                      {ticketType ? (
                        <>
                          <span className="rounded-full bg-[#fafafa] px-3 py-1">{ticketType.name}</span>
                          <span className="rounded-full bg-[#fafafa] px-3 py-1">{ticketType.availableCount} spots left</span>
                        </>
                      ) : null}
                      {event.userTicket?.code ? (
                        <span className="rounded-full bg-[#d4fae8] px-3 py-1 font-semibold text-[#0b7a50]">
                          {event.userTicket.code}
                        </span>
                      ) : null}
                    </div>
                    <button
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={!ticketType || isBooked || isSoldOut || isBusy}
                      onClick={() => bookEvent(event)}
                    >
                      {isBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                      {isBooked
                        ? "Ticket booked"
                        : isSoldOut
                          ? "Sold out"
                          : ticketType && ticketType.priceKobo > 0
                            ? "Buy ticket"
                            : "Book spot"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-[360px] place-items-center rounded-[24px] border border-black/[0.05] p-6 text-center">
            <div>
              <Ticket className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No events yet</h2>
              <p className="mt-2 text-sm text-[#666666]">Admin-published events will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
