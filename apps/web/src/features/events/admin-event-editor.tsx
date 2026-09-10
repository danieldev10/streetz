"use client";

import Image from "next/image";
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from "react";
import { ImagePlus, LoaderCircle, Save } from "lucide-react";
import {
  EVENT_CATEGORY_MAX_LENGTH,
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_TICKET_TIER_NAMES,
  EVENT_TITLE_MAX_LENGTH,
  EVENT_VENUE_MAX_LENGTH,
  SUPPORTED_EVENT_IMAGE_TYPES,
  creatableEventStatuses,
  editableEventStatuses,
  eventStatusLabels,
  isAdminLockedEvent,
  type AdminEventFormState,
} from "@/features/events/admin-event-model";
import { EVENT_CATEGORY_OPTIONS, hasEventEnded } from "@/features/events/event-display";
import { getCitiesForState, nigeriaStateNames } from "@/lib/nigeria-locations";
import type { EventStatus, StreetzEvent } from "@/lib/types";

type AdminEventEditorProps = {
  eventForm: AdminEventFormState;
  setEventForm: Dispatch<SetStateAction<AdminEventFormState>>;
  editingEvent: StreetzEvent | null;
  isEditing: boolean;
  isSaving: boolean;
  isUploadingCoverImage: boolean;
  isCancellingEvent: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUploadCoverImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onRequestCancellation: () => void;
};

export function AdminEventEditor({
  eventForm,
  setEventForm,
  editingEvent,
  isEditing,
  isSaving,
  isUploadingCoverImage,
  isCancellingEvent,
  onSubmit,
  onUploadCoverImage,
  onRequestCancellation,
}: AdminEventEditorProps) {
  const isEditingLockedEvent = Boolean(editingEvent && isAdminLockedEvent(editingEvent));
  const canCancelEditingEvent = Boolean(
    editingEvent && editingEvent.status === "PUBLISHED" && !hasEventEnded(editingEvent),
  );
  const eventStateOptions =
    eventForm.state && !nigeriaStateNames.includes(eventForm.state)
      ? [...nigeriaStateNames, eventForm.state]
      : nigeriaStateNames;
  const knownEventCityOptions = getCitiesForState(eventForm.state);
  const eventCityOptions =
    eventForm.city && !knownEventCityOptions.includes(eventForm.city)
      ? [...knownEventCityOptions, eventForm.city]
      : knownEventCityOptions;

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-2xl rounded-3xl border border-black/5 bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{isEditing ? "Edit event" : "Create event"}</h1>
          <p className="mt-1 text-sm text-ink-600">Publish events and set ticket pricing</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <input
          className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          placeholder="Event title"
          value={eventForm.title}
          onChange={(inputEvent) =>
            setEventForm((current) => ({ ...current, title: inputEvent.target.value }))
          }
          minLength={2}
          maxLength={EVENT_TITLE_MAX_LENGTH}
          required
        />
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
          Category
          <select
            className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            value={eventForm.category}
            onChange={(inputEvent) =>
              setEventForm((current) => ({
                ...current,
                category: inputEvent.target.value.slice(0, EVENT_CATEGORY_MAX_LENGTH),
              }))
            }
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
          className="min-h-28 rounded-[18px] border border-black/8 p-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          placeholder="Description"
          value={eventForm.description}
          onChange={(inputEvent) =>
            setEventForm((current) => ({ ...current, description: inputEvent.target.value }))
          }
          maxLength={EVENT_DESCRIPTION_MAX_LENGTH}
        />
        <div className="rounded-[20px] border border-black/8 p-3">
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-surface-muted text-center">
            {eventForm.coverImage ? (
              <Image
                src={eventForm.coverImage}
                alt="Event cover preview"
                fill
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-cover"
              />
            ) : (
              <div className="px-4 text-sm font-medium text-ink-400">
                <ImagePlus className="mx-auto mb-2 size-7 text-brand" aria-hidden="true" />
                Upload an event cover image
              </div>
            )}
            {isUploadingCoverImage ? (
              <div className="absolute inset-0 grid place-items-center bg-surface/70">
                <LoaderCircle className="size-7 animate-spin text-brand" aria-hidden="true" />
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label
              className={`inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white ${
                isSaving || isUploadingCoverImage ? "pointer-events-none opacity-60" : ""
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
                onChange={onUploadCoverImage}
                disabled={isSaving || isUploadingCoverImage}
              />
            </label>
            {eventForm.coverImage ? (
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-ink-600 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setEventForm((current) => ({ ...current, coverImage: "" }))}
                disabled={isSaving || isUploadingCoverImage}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            placeholder="Venue"
            value={eventForm.venue}
            onChange={(inputEvent) =>
              setEventForm((current) => ({ ...current, venue: inputEvent.target.value }))
            }
            minLength={2}
            maxLength={EVENT_VENUE_MAX_LENGTH}
            required
          />
          <select
            className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
          className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          value={eventForm.city}
          onChange={(inputEvent) =>
            setEventForm((current) => ({ ...current, city: inputEvent.target.value }))
          }
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
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
            Starts
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              type="datetime-local"
              value={eventForm.startsAt}
              onChange={(inputEvent) =>
                setEventForm((current) => ({ ...current, startsAt: inputEvent.target.value }))
              }
              required
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
            Ends
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm font-medium normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              type="datetime-local"
              value={eventForm.endsAt}
              onChange={(inputEvent) =>
                setEventForm((current) => ({ ...current, endsAt: inputEvent.target.value }))
              }
            />
          </label>
        </div>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
          Status
          {isEditingLockedEvent && editingEvent ? (
            <div className="flex h-12 items-center rounded-full border border-black/8 bg-surface-muted px-4 text-sm font-medium normal-case tracking-normal text-ink-600">
              {
                eventStatusLabels[
                  editingEvent.status === "PUBLISHED" && hasEventEnded(editingEvent)
                    ? "COMPLETED"
                    : editingEvent.status
                ]
              }
            </div>
          ) : (
            <select
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              value={eventForm.status}
              onChange={(inputEvent) =>
                setEventForm((current) => ({
                  ...current,
                  status: inputEvent.target.value as EventStatus,
                }))
              }
            >
              {(isEditing ? editableEventStatuses : creatableEventStatuses).map((status) => (
                <option key={status} value={status}>
                  {eventStatusLabels[status]}
                </option>
              ))}
            </select>
          )}
        </label>
        <div className="rounded-[20px] border border-black/8 p-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Ticket tiers</h3>
            <p className="mt-1 text-xs leading-5 text-ink-600">
              Set prices for Regular, VIP, or Tables. If every price is empty, the event is free.
            </p>
          </div>
          <div className="mt-4 grid gap-4">
            {EVENT_TICKET_TIER_NAMES.map((name) => {
              const tier = eventForm.ticketTiers[name];

              return (
                <div key={name} className="rounded-2xl bg-surface-muted p-3">
                  <p className="text-sm font-semibold text-ink">{name}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                      Price (₦)
                      <input
                        className="h-11 rounded-full border border-black/8 bg-surface px-4 text-sm font-medium normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
                    <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                      Capacity
                      <input
                        className="h-11 rounded-full border border-black/8 bg-surface px-4 text-sm font-medium normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
                    <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                      Max
                      <input
                        className="h-11 rounded-full border border-black/8 bg-surface px-4 text-sm font-medium normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
        <div className="rounded-[20px] border border-black/8 p-4">
          <span className="block text-sm font-semibold text-ink">Guest booking</span>
          <span className="mt-1 block text-xs leading-5 text-ink-600">
            Free events automatically allow verified-email guest booking. Paid events remain
            members-only.
          </span>
        </div>
      </div>

      <button
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving || isUploadingCoverImage}
      >
        {isSaving || isUploadingCoverImage ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="size-4" aria-hidden="true" />
        )}
        {isUploadingCoverImage ? "Uploading image" : isEditing ? "Save event" : "Create event"}
      </button>
      {canCancelEditingEvent ? (
        <button
          className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-danger-border px-5 text-sm font-medium text-danger hover:bg-danger-tint disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={onRequestCancellation}
          disabled={isSaving || isUploadingCoverImage || isCancellingEvent}
        >
          Cancel event
        </button>
      ) : null}
    </form>
  );
}
