"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { useToast } from "@/components/app/toast-provider";
import { LoadingState } from "@/components/loading-state";
import { AdminEventCancellationModal } from "@/features/events/admin-event-cancellation-modal";
import { AdminEventEditor } from "@/features/events/admin-event-editor";
import {
  EVENT_IMAGE_FILE_NAME_MAX_LENGTH,
  SUPPORTED_EVENT_IMAGE_TYPES,
  buildAdminEventPayload,
  createEmptyEventForm,
  getEventForm,
  type AdminEventFormState,
} from "@/features/events/admin-event-model";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { EVENT_IMAGE_UPLOAD_MAX_BYTES, prepareImageForUpload } from "@/lib/image-upload";
import type { StreetzEvent } from "@/lib/types";

type EventImageUploadResponse = {
  uploadUrl: string;
  publicUrl: string;
};

export function AdminEventForm({ token, mode, eventId }: {
  token: string;
  mode: "create" | "edit";
  eventId?: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const isEditing = mode === "edit";
  const [eventForm, setEventForm] = useState<AdminEventFormState>(() => createEmptyEventForm());
  const [editingEvent, setEditingEvent] = useState<StreetzEvent | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(isEditing);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isUploadingCoverImage, setIsUploadingCoverImage] = useState(false);
  const [pendingCancellation, setPendingCancellation] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancellingEvent, setIsCancellingEvent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing || !eventId) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoadingEvent(true);
      setNotice(null);

      try {
        const response = await apiRequest<{ events: StreetzEvent[] }>("/admin/events", {
          headers: authHeaders(token),
        });
        const event = response.events.find((candidate) => candidate.id === eventId);

        if (!event) {
          throw new Error("Event not found.");
        }

        if (!cancelled) {
          setEditingEvent(event);
          setEventForm(getEventForm(event));
        }
      } catch (error) {
        if (!cancelled) {
          setNotice(getUserErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingEvent(false);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventId, isEditing, token]);

  function closeForm() {
    router.push("/events");
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
        throw new Error(
          `Event image file name must be ${EVENT_IMAGE_FILE_NAME_MAX_LENGTH} characters or fewer.`,
        );
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
      setNotice(
        message === "Failed to fetch"
          ? "Event image upload failed. Check the bucket CORS settings, then try again."
          : message,
      );
    } finally {
      setIsUploadingCoverImage(false);
      input.value = "";
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isUploadingCoverImage) {
      setNotice("Wait for the event image upload to finish before saving.");
      return;
    }

    const result = buildAdminEventPayload(eventForm);

    if (!result.ok) {
      setNotice(result.error);
      return;
    }

    setIsSavingEvent(true);
    setNotice(null);

    try {
      await apiRequest<StreetzEvent>(isEditing ? `/admin/events/${eventId}` : "/admin/events", {
        method: isEditing ? "PUT" : "POST",
        headers: authHeaders(token),
        body: JSON.stringify(result.payload),
      });
      showToast(isEditing ? "Event updated." : "Event created.");
      router.push("/events");
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSavingEvent(false);
    }
  }

  async function cancelEvent() {
    if (!editingEvent) {
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
      await apiRequest<StreetzEvent>(`/admin/events/${editingEvent.id}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ status: "CANCELLED", cancellationReason: trimmedReason }),
      });
      showToast("Event cancelled. Paid attendees remain on record for manual refunds.");
      router.push("/events");
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsCancellingEvent(false);
    }
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Events"
        title=""
        leading={
          <button
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
            type="button"
            onClick={closeForm}
            aria-label="Back to events"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? (
          <p className="mb-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">
            {notice}
          </p>
        ) : null}

        {isLoadingEvent ? (
          <LoadingState label="Loading event" className="min-h-90 rounded-3xl border border-black/5" />
        ) : isEditing && !editingEvent ? (
          <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
            <div>
              <h2 className="text-xl font-semibold">Event unavailable</h2>
              <p className="mt-2 text-sm text-[#666666]">
                Return to events and choose another event to edit.
              </p>
            </div>
          </div>
        ) : (
          <AdminEventEditor
            eventForm={eventForm}
            setEventForm={setEventForm}
            editingEvent={editingEvent}
            isEditing={isEditing}
            isSaving={isSavingEvent}
            isUploadingCoverImage={isUploadingCoverImage}
            isCancellingEvent={isCancellingEvent}
            onSubmit={saveEvent}
            onUploadCoverImage={uploadCoverImage}
            onRequestCancellation={() => {
              setCancellationReason("");
              setPendingCancellation(true);
            }}
          />
        )}
      </div>

      {pendingCancellation && editingEvent ? (
        <AdminEventCancellationModal
          event={editingEvent}
          reason={cancellationReason}
          isCancelling={isCancellingEvent}
          onReasonChange={setCancellationReason}
          onClose={() => {
            setPendingCancellation(false);
            setCancellationReason("");
          }}
          onConfirm={() => void cancelEvent()}
        />
      ) : null}
    </section>
  );
}
