"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { ArrowLeft, Ban, ChevronLeft, ChevronRight, Flag, HeartOff, LoaderCircle, MapPin, X } from "lucide-react";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { formatConnectionStatus } from "@/lib/profile";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASON_OPTIONS } from "@/lib/report-reasons";
import type { DiscoveryCandidate } from "@/lib/types";

export function MemberProfileView({
  candidate,
  onBack,
  backLabel,
  footer,
  token,
  showSafetyActions = false,
  showUnmatchAction = false,
  onBlocked,
  onReported,
  onUnmatched,
}: {
  candidate: DiscoveryCandidate;
  onBack: () => void;
  backLabel: string;
  footer?: ReactNode;
  token?: string;
  showSafetyActions?: boolean;
  showUnmatchAction?: boolean;
  onBlocked?: (candidate: DiscoveryCandidate) => void;
  onReported?: (candidate: DiscoveryCandidate) => void;
  onUnmatched?: (candidate: DiscoveryCandidate) => void | Promise<void>;
}) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
  const [isUnmatchConfirmOpen, setIsUnmatchConfirmOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isSubmittingSafetyAction, setIsSubmittingSafetyAction] = useState(false);
  const photos = candidate.photos;
  const hasMultiplePhotos = photos.length > 1;
  const activePhoto = photos[activePhotoIndex];
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ") || "Nigeria";
  const canUseSafetyActions = showSafetyActions && Boolean(token);
  const canUseUnmatchAction = canUseSafetyActions && showUnmatchAction && Boolean(onUnmatched);

  function goToPrevious() {
    setActivePhotoIndex((current) => (current > 0 ? current - 1 : photos.length - 1));
  }

  function goToNext() {
    setActivePhotoIndex((current) => (current < photos.length - 1 ? current + 1 : 0));
  }

  async function blockProfile() {
    if (!token || isSubmittingSafetyAction) {
      return;
    }

    setIsSubmittingSafetyAction(true);
    setActionNotice(null);

    try {
      await apiRequest("/discovery/block", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ targetUserId: candidate.id }),
      });
      setIsBlockConfirmOpen(false);
      setActionNotice("Profile blocked.");
      onBlocked?.(candidate);
    } catch (error) {
      setActionNotice(getUserErrorMessage(error));
    } finally {
      setIsSubmittingSafetyAction(false);
    }
  }

  async function unmatchProfile() {
    if (!onUnmatched || isSubmittingSafetyAction) {
      return;
    }

    setIsSubmittingSafetyAction(true);
    setActionNotice(null);

    try {
      await onUnmatched(candidate);
      setIsUnmatchConfirmOpen(false);
      setActionNotice("Match removed.");
    } catch (error) {
      setActionNotice(getUserErrorMessage(error));
    } finally {
      setIsSubmittingSafetyAction(false);
    }
  }

  async function reportProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || isSubmittingSafetyAction) {
      return;
    }

    const reason = reportReason.trim();
    const details = reportDetails.trim();

    if (!REPORT_REASON_OPTIONS.includes(reason as (typeof REPORT_REASON_OPTIONS)[number])) {
      setReportError("Choose a report reason.");
      return;
    }

    if (details.length > REPORT_DETAILS_MAX_LENGTH) {
      setReportError(`Details must be ${REPORT_DETAILS_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setIsSubmittingSafetyAction(true);
    setReportError(null);
    setActionNotice(null);

    try {
      await apiRequest("/discovery/report", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          targetUserId: candidate.id,
          reason,
          ...(details ? { details } : {}),
        }),
      });
      setReportReason("");
      setReportDetails("");
      setIsReportOpen(false);
      setActionNotice("Report sent.");
      onReported?.(candidate);
    } catch (error) {
      setReportError(getUserErrorMessage(error));
    } finally {
      setIsSubmittingSafetyAction(false);
    }
  }

  return (
    <section className="pt-5 md:pt-8">
      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className="mx-auto max-w-[560px]">
          <button
            className="mb-4 inline-flex h-10 items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#0d0d0d] shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
            type="button"
            onClick={onBack}
            aria-label={backLabel}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </button>
          <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <div className="relative aspect-[1.05] min-h-[320px] bg-[#d4fae8]">

              {/* Segmented progress bar */}
              {hasMultiplePhotos ? (
                <div className="absolute inset-x-4 top-3 z-10 flex gap-1">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="h-[2px] flex-1 rounded-full"
                      style={{
                        backgroundColor: index === activePhotoIndex ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                      }}
                    />
                  ))}
                </div>
              ) : null}

              <ProfilePhotoImage
                key={activePhoto?.id}
                photo={activePhoto}
                alt={`${candidate.displayName} profile photo ${activePhotoIndex + 1} of ${photos.length}`}
                variant="full"
                sizes="(max-width: 768px) 100vw, 560px"
                iconSize="lg"
              />

              {/* Tap zones for navigating photos */}
              {hasMultiplePhotos ? (
                <>
                  <button
                    type="button"
                    className="absolute inset-y-0 left-0 z-[5] w-[30%] cursor-pointer"
                    onClick={goToPrevious}
                    aria-label="Previous photo"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 z-[5] w-[30%] cursor-pointer"
                    onClick={goToNext}
                    aria-label="Next photo"
                  />

                  {/* Chevron arrows */}
                  <div
                    className="pointer-events-none absolute left-3 top-1/2 z-[6] grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm"
                    aria-hidden="true"
                  >
                    <ChevronLeft className="size-4" />
                  </div>
                  <div
                    className="pointer-events-none absolute right-3 top-1/2 z-[6] grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm"
                    aria-hidden="true"
                  >
                    <ChevronRight className="size-4" />
                  </div>
                </>
              ) : null}

              <div className="absolute inset-x-0 bottom-0 z-[7] bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
                <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                  {formatConnectionStatus(candidate.connectionStatus)}
                </span>
                <h2 className="mt-3 text-3xl font-semibold">
                  {candidate.displayName}
                  {candidate.age ? `, ${candidate.age}` : ""}
                </h2>
                <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                  <MapPin className="size-4" aria-hidden="true" />
                  {location}
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Bio</p>
                <p className="mt-2 text-sm leading-6 text-[#444444]">{candidate.bio || "No bio added yet."}</p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Status</p>
                <p className="mt-2 text-sm font-medium text-[#444444]">
                  {formatConnectionStatus(candidate.connectionStatus)}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Location</p>
                <p className="mt-2 flex items-center gap-1 text-sm font-medium text-[#444444]">
                  <MapPin className="size-4 text-[#18E299]" aria-hidden="true" />
                  {location}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Interests</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidate.interests.length > 0 ? (
                    candidate.interests.slice(0, 10).map((interest) => (
                      <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
                        {interest}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#777777]">No interests added yet.</span>
                  )}
                </div>
              </div>

              {actionNotice ? (
                <p className="mt-5 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{actionNotice}</p>
              ) : null}

              {canUseSafetyActions ? (
                <div
                  className={`mt-5 grid gap-2 border-t border-black/[0.05] pt-5 ${canUseUnmatchAction ? "grid-cols-3" : "grid-cols-2"}`}
                >
                  <button
                    className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border border-black/[0.08] px-2 text-[13px] font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => {
                      setActionNotice(null);
                      setReportError(null);
                      setReportReason("");
                      setReportDetails("");
                      setIsReportOpen(true);
                    }}
                    disabled={isSubmittingSafetyAction}
                  >
                    <Flag className="size-[18px] shrink-0 stroke-[2.2]" aria-hidden="true" />
                    Report
                  </button>
                  {canUseUnmatchAction ? (
                    <button
                      className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border border-black/[0.08] bg-[#fafafa] px-2 text-[13px] font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => {
                        setActionNotice(null);
                        setIsUnmatchConfirmOpen(true);
                      }}
                      disabled={isSubmittingSafetyAction}
                    >
                      <HeartOff className="size-[18px] shrink-0 stroke-[2.2]" aria-hidden="true" />
                      Unmatch
                    </button>
                  ) : null}
                  <button
                    className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-2 text-[13px] font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => {
                      setActionNotice(null);
                      setIsBlockConfirmOpen(true);
                    }}
                    disabled={isSubmittingSafetyAction}
                  >
                    <Ban className="size-[18px] shrink-0 stroke-[2.2]" aria-hidden="true" />
                    Block
                  </button>
                </div>
              ) : null}
            </div>
          </article>
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
      </div>

      {isBlockConfirmOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                <Ban className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0d0d0d]">Block this profile?</h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  You will stop seeing {candidate.displayName} and any active match will close.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setIsBlockConfirmOpen(false)}
                disabled={isSubmittingSafetyAction}
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={blockProfile}
                disabled={isSubmittingSafetyAction}
              >
                {isSubmittingSafetyAction ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Block
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isUnmatchConfirmOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f5f5f5] text-[#0d0d0d]">
                <HeartOff className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0d0d0d]">Unmatch {candidate.displayName}?</h2>
                <p className="mt-1 text-sm leading-6 text-[#666666]">
                  This removes the chat from both Matches lists. You may see each other in Discovery again later.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setIsUnmatchConfirmOpen(false)}
                disabled={isSubmittingSafetyAction}
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={unmatchProfile}
                disabled={isSubmittingSafetyAction}
              >
                {isSubmittingSafetyAction ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Unmatch
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isReportOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <form
            className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
            onSubmit={reportProfile}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d4fae8] text-[#0fa76e]">
                  <Flag className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[#0d0d0d]">Report profile</h2>
                  <p className="mt-1 text-sm leading-6 text-[#666666]">
                    Tell us what is wrong with {candidate.displayName}&apos;s profile.
                  </p>
                </div>
              </div>
              <button
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
                type="button"
                onClick={() => {
                  setIsReportOpen(false);
                  setReportReason("");
                  setReportDetails("");
                  setReportError(null);
                }}
                disabled={isSubmittingSafetyAction}
                aria-label="Close report"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <select
              className="mt-4 h-11 w-full rounded-full border border-black/[0.08] bg-white px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              value={reportReason}
              onChange={(event) => {
                setReportReason(event.target.value);
                setReportError(null);
              }}
              required
              disabled={isSubmittingSafetyAction}
            >
              <option value="">Choose a violation</option>
              {REPORT_REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <textarea
              className="mt-3 min-h-24 w-full resize-none rounded-[20px] border border-black/[0.08] p-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              placeholder="Optional details"
              value={reportDetails}
              onChange={(event) => {
                setReportDetails(event.target.value);
                setReportError(null);
              }}
              maxLength={REPORT_DETAILS_MAX_LENGTH}
              disabled={isSubmittingSafetyAction}
            />
            {reportError ? <p className="mt-2 text-xs font-medium text-red-600">{reportError}</p> : null}
            <button
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmittingSafetyAction || !reportReason}
            >
              {isSubmittingSafetyAction ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              Send report
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
