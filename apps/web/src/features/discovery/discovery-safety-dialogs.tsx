import { Ban, Flag, LoaderCircle } from "lucide-react";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASON_OPTIONS } from "@/lib/report-reasons";
import type { DiscoveryCandidate } from "@/lib/types";

export function BlockCandidateDialog({
  candidate,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  candidate: DiscoveryCandidate;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
            <Ban className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#0d0d0d]">Block this profile?</h2>
            <p className="mt-1 text-sm leading-6 text-[#666666]">
              You will stop seeing {candidate.displayName} in discovery.
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Block
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportCandidateDialog({
  candidate,
  details,
  error,
  isSubmitting,
  reason,
  onCancel,
  onDetailsChange,
  onReasonChange,
  onSubmit,
}: {
  candidate: DiscoveryCandidate;
  details: string;
  error: string | null;
  isSubmitting: boolean;
  reason: string;
  onCancel: () => void;
  onDetailsChange: (details: string) => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <form
        className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f6e0f6] text-[#9d2a9e]">
            <Flag className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#0d0d0d]">Report profile</h2>
            <p className="mt-1 text-sm leading-6 text-[#666666]">
              Tell us what is wrong with this profile from {candidate.displayName}.
            </p>
          </div>
        </div>
        <select
          className="mt-4 h-11 w-full rounded-full border border-black/[0.08] bg-white px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          required
          disabled={isSubmitting}
        >
          <option value="">Choose a violation</option>
          {REPORT_REASON_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <textarea
          className="mt-3 min-h-24 w-full resize-none rounded-[20px] border border-black/[0.08] p-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
          placeholder="Optional details"
          value={details}
          onChange={(event) => onDetailsChange(event.target.value)}
          maxLength={REPORT_DETAILS_MAX_LENGTH}
          disabled={isSubmitting}
        />
        {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting || !reason}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Send report
          </button>
        </div>
      </form>
    </div>
  );
}
