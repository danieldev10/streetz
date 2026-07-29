import type { FormEventHandler } from "react";
import { ArrowLeft, LoaderCircle, Save } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
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
      <ScreenHeader
        eyebrow="Rooms"
        title={editingRoomId ? "Edit room." : "Create room."}
        leading={
          <button
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
            type="button"
            onClick={onBack}
            aria-label="Back to rooms"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

        <form
          onSubmit={onSubmit}
          className="mx-auto max-w-2xl rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingRoomId ? "Edit room" : "Create room"}</h2>
              <p className="mt-1 text-sm text-[#666666]">Admin-created spaces for member conversations</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
              placeholder="Room name"
              value={roomForm.name}
              onChange={(event) => onChange({ name: event.target.value })}
              minLength={2}
              maxLength={ROOM_NAME_MAX_LENGTH}
              required
            />
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
              placeholder="Category"
              value={roomForm.category}
              onChange={(event) => onChange({ category: event.target.value })}
              minLength={2}
              maxLength={ROOM_CATEGORY_MAX_LENGTH}
              required
            />
            <textarea
              className="min-h-28 rounded-[18px] border border-black/8 p-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
              placeholder="Description"
              value={roomForm.description}
              onChange={(event) => onChange({ description: event.target.value })}
              maxLength={ROOM_DESCRIPTION_MAX_LENGTH}
            />
            <label className="flex items-center justify-between gap-3 rounded-[18px] bg-[#fafafa] px-4 py-3 text-sm font-medium">
              Active room
              <input
                type="checkbox"
                checked={roomForm.isActive}
                onChange={(event) => onChange({ isActive: event.target.checked })}
              />
            </label>
          </div>

          <button
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
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
