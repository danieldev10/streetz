"use client";

import { LoaderCircle, X } from "lucide-react";
import {
  EVENT_CANCELLATION_REASON_MAX_LENGTH,
  getCancellationImpact,
} from "@/features/events/admin-event-model";
import { formatPrice } from "@/features/events/event-display";
import type { StreetzEvent } from "@/lib/types";

export function AdminEventCancellationModal({
  event,
  reason,
  isCancelling,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  event: StreetzEvent;
  reason: string;
  isCancelling: boolean;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const impact = getCancellationImpact(event);
  const canConfirm = reason.trim().length > 0 && !isCancelling;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <section className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#0d0d0d]">Cancel event?</h2>
            <p className="mt-2 text-sm leading-6 text-[#666666]">
              &quot;{event.title}&quot; will move to inactive events. Paid tickets will remain on
              record.
            </p>
          </div>
          <button
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            aria-label="Close confirmation"
            title="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-[#fafafa] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
              Paid
            </p>
            <p className="mt-1 text-lg font-semibold text-[#0d0d0d]">{impact.paidTickets}</p>
          </div>
          <div className="rounded-2xl bg-[#fafafa] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
              Reserved
            </p>
            <p className="mt-1 text-lg font-semibold text-[#0d0d0d]">
              {impact.activeReservations}
            </p>
          </div>
          <div className="rounded-2xl bg-[#fafafa] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
              Paid total
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[#0d0d0d]">
              {formatPrice(impact.totalPaidAmountKobo)}
            </p>
          </div>
        </div>

        {impact.paidTickets > 0 ? (
          <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm leading-6 text-red-700">
            This event has paid attendees. Refunds must be handled manually for now, and attendees
            will be told they will be contacted by email.
          </p>
        ) : null}

        <label className="mt-4 grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
          Cancellation reason
          <textarea
            className="min-h-24 rounded-2xl border border-black/8 px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
            value={reason}
            onChange={(inputEvent) =>
              onReasonChange(inputEvent.target.value.slice(0, EVENT_CANCELLATION_REASON_MAX_LENGTH))
            }
            placeholder="Tell attendees why the event is being cancelled."
            disabled={isCancelling}
            maxLength={EVENT_CANCELLATION_REASON_MAX_LENGTH}
          />
          <span className="text-right text-[11px] font-medium normal-case tracking-normal text-[#999999]">
            {reason.length}/{EVENT_CANCELLATION_REASON_MAX_LENGTH}
          </span>
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onClose}
            disabled={isCancelling}
          >
            Keep event
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {isCancelling ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Cancel event
          </button>
        </div>
      </section>
    </div>
  );
}
