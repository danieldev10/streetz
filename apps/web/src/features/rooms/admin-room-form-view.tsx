import type { FormEventHandler } from "react";
import { ArrowLeft, LoaderCircle, Save } from "lucide-react";
import {
  ROOM_CATEGORY_MAX_LENGTH,
  ROOM_DESCRIPTION_MAX_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  type RoomForm,
} from "./room-model";

export function AdminRoomFormView({
  editingRoomId,
  roomForm,
  notice,
  isSaving,
  onBack,
  onSubmit,
  onChange,
}: {
  editingRoomId: string | null;
  roomForm: RoomForm;
  notice: string | null;
  isSaving: boolean;
  onBack: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onChange: (patch: Partial<RoomForm>) => void;
}) {
  return (
    <section>
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <div className="mb-4 flex items-center gap-3">
          <button
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8"
            type="button"
            onClick={onBack}
            aria-label="Back to rooms"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <h1 className="min-w-0 truncate text-xl font-semibold text-ink">
            {editingRoomId ? "Edit room." : "Create room."}
          </h1>
        </div>

        {notice ? <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        <form
          onSubmit={onSubmit}
          className="mx-auto max-w-2xl rounded-3xl border border-black/5 bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingRoomId ? "Edit room" : "Create room"}</h2>
              <p className="mt-1 text-sm text-ink-600">Admin-created spaces for member conversations</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="Room name"
              value={roomForm.name}
              onChange={(event) => onChange({ name: event.target.value })}
              minLength={2}
              maxLength={ROOM_NAME_MAX_LENGTH}
              required
            />
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="Category"
              value={roomForm.category}
              onChange={(event) => onChange({ category: event.target.value })}
              minLength={2}
              maxLength={ROOM_CATEGORY_MAX_LENGTH}
              required
            />
            <textarea
              className="min-h-28 rounded-[18px] border border-black/8 p-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="Description"
              value={roomForm.description}
              onChange={(event) => onChange({ description: event.target.value })}
              maxLength={ROOM_DESCRIPTION_MAX_LENGTH}
            />
            <label className="flex items-center justify-between gap-3 rounded-[18px] bg-surface-muted px-4 py-3 text-sm font-medium">
              Active room
              <input
                type="checkbox"
                checked={roomForm.isActive}
                onChange={(event) => onChange({ isActive: event.target.checked })}
              />
            </label>
          </div>

          <button
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {editingRoomId ? "Save room" : "Create room"}
          </button>
        </form>
      </div>
    </section>
  );
}
