import { LoaderCircle, MapPin } from "lucide-react";
import type { PendingDisplayLocation } from "./discovery-model";

export function DisplayLocationDialog({
  isSaving,
  location,
  onCancel,
  onConfirm,
}: {
  isSaving: boolean;
  location: PendingDisplayLocation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f6e0f6] text-[#9d2a9e]">
            <MapPin className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#0d0d0d]">Update display location?</h2>
            <p className="mt-1 text-sm leading-6 text-[#666666]">
              You seem to be in {location.city}, {location.state}.
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            Keep current
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
