import { LoaderCircle, MapPin, X } from "lucide-react";
import {
  DEFAULT_DISCOVERY_DISTANCE_KM,
  DISCOVERY_DISTANCE_STEP_KM,
  MAX_DISCOVERY_DISTANCE_KM,
  MIN_DISCOVERY_DISTANCE_KM,
} from "@/lib/location";
import type { DiscoveryFilters, DiscoveryLocationMeta } from "./discovery-model";

export function DiscoveryFiltersDialog({
  draftFilters,
  draftMaxDistanceKm,
  isDetectingLocation,
  isSaving,
  location,
  onApply,
  onCancel,
  onChangeFilters,
  onChangeMaxDistance,
  onChangePreferences,
  onUpdateLocation,
}: {
  draftFilters: DiscoveryFilters;
  draftMaxDistanceKm: number;
  isDetectingLocation: boolean;
  isSaving: boolean;
  location: DiscoveryLocationMeta;
  onApply: () => void;
  onCancel: () => void;
  onChangeFilters: (filters: DiscoveryFilters) => void;
  onChangeMaxDistance: (distanceKm: number) => void;
  onChangePreferences: () => void;
  onUpdateLocation: () => void;
}) {
  const isNoLimitDistance = location.maxDistanceKm === 0;

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/35 px-5 backdrop-blur-sm"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "max(24px, env(safe-area-inset-top))",
        paddingBottom: 24,
      }}
    >
      <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#0d0d0d]">Discovery filters</h2>
            <p className="mt-1 text-sm leading-6 text-[#666666]">
              {!location.hasCoordinates
                ? "GPS is off, so distances stay hidden."
                : isNoLimitDistance
                  ? "Showing profiles from anywhere."
                  : "Using GPS for nearby profiles."}
            </p>
          </div>
          <button
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
            type="button"
            onClick={onCancel}
            aria-label="Close filters"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-[20px] border border-black/[0.06] bg-[#fafafa] p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-[#0d0d0d]">Maximum distance</span>
            <div className="flex items-center gap-2">
              {draftMaxDistanceKm > 0 ? (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0d0d0d]">
                  {draftMaxDistanceKm} km
                </span>
              ) : null}
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  draftMaxDistanceKm === 0 ? "bg-[#0d0d0d] text-white" : "bg-white text-[#666666]"
                }`}
                onClick={() =>
                  onChangeMaxDistance(
                    draftMaxDistanceKm === 0 ? DEFAULT_DISCOVERY_DISTANCE_KM : 0
                  )
                }
              >
                No limit
              </button>
            </div>
          </div>
          <input
            className="mt-4 w-full accent-[#bd40be] disabled:opacity-40"
            type="range"
            min={MIN_DISCOVERY_DISTANCE_KM}
            max={MAX_DISCOVERY_DISTANCE_KM}
            step={DISCOVERY_DISTANCE_STEP_KM}
            value={draftMaxDistanceKm === 0 ? MAX_DISCOVERY_DISTANCE_KM : draftMaxDistanceKm}
            onChange={(event) => onChangeMaxDistance(Number(event.target.value))}
            disabled={draftMaxDistanceKm === 0}
          />
        </div>

        <button
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={onUpdateLocation}
          disabled={isDetectingLocation || isSaving}
        >
          {isDetectingLocation ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <MapPin className="size-4" aria-hidden="true" />
          )}
          {location.hasCoordinates ? "Update GPS location" : "Use GPS location"}
        </button>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Age range</p>
          <div className="mt-2 flex items-center gap-3">
            <AgeInput
              label="Min"
              placeholder="18"
              value={draftFilters.minAge}
              onChange={(minAge) => onChangeFilters({ ...draftFilters, minAge })}
            />
            <span className="mt-5 text-sm text-[#888888]">–</span>
            <AgeInput
              label="Max"
              placeholder="100"
              value={draftFilters.maxAge}
              onChange={(maxAge) => onChangeFilters({ ...draftFilters, maxAge })}
            />
          </div>
        </div>

        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d]"
          type="button"
          onClick={onChangePreferences}
        >
          Change who I’d like to meet
        </button>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={isSaving || isDetectingLocation}
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onApply}
            disabled={isSaving || isDetectingLocation}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function AgeInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-xs text-[#666666]">{label}</span>
      <input
        className="h-11 w-full rounded-full border border-black/[0.08] px-4 text-sm text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
        type="number"
        min={18}
        max={100}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? null
              : Math.max(18, Math.min(100, Number(event.target.value)))
          )
        }
      />
    </label>
  );
}
