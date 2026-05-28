"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  ChevronRight,
  LoaderCircle,
  Mail,
  MapPin,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Timer,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { REPORT_REASON_OPTIONS } from "@/lib/report-reasons";
import type { AdminReport, AdminReportUser, ModerationActionType, ReportStatus } from "@/lib/types";

const reportStatusOptions: Array<ReportStatus | "ALL"> = ["ALL", "OPEN", "REVIEWED", "DISMISSED", "ACTIONED"];

const reportStatusLabels: Record<ReportStatus | "ALL", string> = {
  ALL: "All",
  OPEN: "Open",
  REVIEWED: "Reviewed",
  DISMISSED: "Dismissed",
  ACTIONED: "Actioned",
};

const reportStatusClasses: Record<ReportStatus, string> = {
  OPEN: "bg-[#fff2d9] text-[#9a5b00]",
  REVIEWED: "bg-[#e8f1ff] text-[#2867c7]",
  DISMISSED: "bg-[#f4f4f4] text-[#666666]",
  ACTIONED: "bg-[#d4fae8] text-[#0b7a50]",
};

type ReportModerationAction = Extract<ModerationActionType, "SUSPEND" | "BAN" | "RESTORE" | "DELETE">;

type PendingReportDecision =
  | {
    kind: "dismiss";
    title: string;
    body: string;
    confirmLabel: string;
    tone: "default" | "danger";
  }
  | {
    kind: "moderation";
    action: ReportModerationAction;
    durationDays?: number;
    title: string;
    body: string;
    confirmLabel: string;
    tone: "default" | "danger";
  };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLocation(user: { city: string | null; state: string | null }) {
  return [user.city, user.state].filter(Boolean).join(", ") || "No location";
}

function formatEnumLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : null;
}

function getReportStatusLabel(status: ReportStatus) {
  return reportStatusLabels[status];
}

function getReportStatusClass(status: ReportStatus) {
  return reportStatusClasses[status];
}

function getCustomSuspensionDays(value: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(365, Math.max(1, parsed));
}

function buildModerationConfirmation(
  report: AdminReport,
  action: ReportModerationAction,
  durationDays?: number
): PendingReportDecision {
  const name = report.reported.displayName;

  if (action === "SUSPEND") {
    const days = durationDays ?? 7;

    return {
      kind: "moderation",
      action,
      durationDays: days,
      title: `Suspend ${name}?`,
      body: `This will make the account unavailable for ${days} day${days === 1 ? "" : "s"} and mark this report as actioned.`,
      confirmLabel: `Suspend ${days}d`,
      tone: "default",
    };
  }

  if (action === "BAN") {
    return {
      kind: "moderation",
      action,
      title: `Ban ${name}?`,
      body: "This will block account access until an admin restores the account and mark this report as actioned.",
      confirmLabel: "Ban account",
      tone: "danger",
    };
  }

  if (action === "DELETE") {
    return {
      kind: "moderation",
      action,
      title: `Delete ${name}?`,
      body: "This will anonymize the profile, disable login, and mark this report as actioned.",
      confirmLabel: "Delete account",
      tone: "danger",
    };
  }

  return {
    kind: "moderation",
    action,
    title: `Restore ${name}?`,
    body: "This will restore normal account access and mark the report as reviewed.",
    confirmLabel: "Restore account",
    tone: "default",
  };
}

function buildDismissConfirmation(report: AdminReport): PendingReportDecision {
  return {
    kind: "dismiss",
    title: "Dismiss report?",
    body: `This will close the report against ${report.reported.displayName} without applying account moderation.`,
    confirmLabel: "Dismiss report",
    tone: "default",
  };
}

export function ReportsTab({ token }: { token: string }) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportFilter, setReportFilter] = useState<ReportStatus | "ALL">("OPEN");
  const [reasonFilter, setReasonFilter] = useState("ALL");
  const [isReportFilterOpen, setIsReportFilterOpen] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesStatus = reportFilter === "ALL" || report.status === reportFilter;
      const matchesReason = reasonFilter === "ALL" || report.reason === reasonFilter;

      return matchesStatus && matchesReason;
    });
  }, [reasonFilter, reportFilter, reports]);
  const reasonOptions = useMemo(() => {
    const knownReasons = new Set<string>(REPORT_REASON_OPTIONS);
    const unknownReasons = Array.from(new Set(reports.map((report) => report.reason).filter((reason) => !knownReasons.has(reason))))
      .sort((first, second) => first.localeCompare(second));

    return ["ALL", ...REPORT_REASON_OPTIONS, ...unknownReasons];
  }, [reports]);
  const activeFilterCount = [reportFilter !== "OPEN", reasonFilter !== "ALL"].filter(Boolean).length;
  const hasActiveReportFilter = activeFilterCount > 0;

  const loadReports = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options;

      if (showLoading) {
        setIsLoadingReports(true);
      }

      setNotice(null);

      try {
        const response = await apiRequest<{ reports: AdminReport[] }>("/admin/reports", {
          headers: authHeaders(token),
        });
        setReports(response.reports);
      } catch (error) {
        setNotice(getUserErrorMessage(error));
      } finally {
        if (showLoading) {
          setIsLoadingReports(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReports();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadReports]);

  useEffect(() => {
    if (!isReportFilterOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsReportFilterOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isReportFilterOpen]);

  return (
    <section>
      <ScreenHeader
        eyebrow="Reports"
        title=""
        action={
          <button
            className={`relative inline-flex size-10 items-center justify-center rounded-full border text-[#0d0d0d] ${hasActiveReportFilter ? "border-[#18E299] bg-[#d4fae8]" : "border-black/8 bg-white"
              }`}
            type="button"
            onClick={() => setIsReportFilterOpen(true)}
            aria-label="Filter reports"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {hasActiveReportFilter ? (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#18E299] text-[9px] font-semibold text-[#0d0d0d]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        }
      />

      {isReportFilterOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-4 backdrop-blur-sm sm:p-5">
          <button
            className="absolute inset-0"
            type="button"
            onClick={() => setIsReportFilterOpen(false)}
            aria-label="Close filters"
          />
          <div
            className="relative w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
            role="dialog"
            aria-modal="true"
            aria-label="Report filters"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Filters</p>
                <h2 className="mt-1 text-xl font-semibold text-[#0d0d0d]">Reports</h2>
              </div>
              <button
                className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
                type="button"
                onClick={() => setIsReportFilterOpen(false)}
                aria-label="Close filters"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Status
                <select
                  className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  value={reportFilter}
                  onChange={(event) => setReportFilter(event.target.value as ReportStatus | "ALL")}
                >
                  {reportStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {reportStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Violation
                <select
                  className="h-12 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  value={reasonFilter}
                  onChange={(event) => setReasonFilter(event.target.value)}
                >
                  {reasonOptions.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason === "ALL" ? "All violations" : reason}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-12 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => {
                  setReportFilter("OPEN");
                  setReasonFilter("ALL");
                }}
                disabled={!hasActiveReportFilter}
              >
                Clear
              </button>
              <button
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white"
                type="button"
                onClick={() => setIsReportFilterOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingReports ? (
          <div className={`${notice ? "mt-4" : ""} grid min-h-64 place-items-center rounded-[28px] border border-black/5`}>
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading reports</p>
            </div>
          </div>
        ) : visibleReports.length > 0 ? (
          <div className={`${notice ? "mt-4" : ""} overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]`}>
            {visibleReports.map((report) => (
              <ReportListItem key={report.id} report={report} />
            ))}
          </div>
        ) : (
          <div className={`${notice ? "mt-4" : ""} grid min-h-64 place-items-center rounded-[28px] border border-black/5 p-6 text-center`}>
            <div>
              <AlertTriangle className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h3 className="mt-3 text-2xl font-semibold">No reports here</h3>
              <p className="mt-2 text-sm text-[#666666]">Reports matching these filters will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function ReportDetail({ token, reportId }: { token: string; reportId: string }) {
  const [report, setReport] = useState<AdminReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [isModerating, setIsModerating] = useState(false);
  const [moderationReason, setModerationReason] = useState("");
  const [suspensionDays, setSuspensionDays] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingReportDecision | null>(null);
  const [selectedProfileUser, setSelectedProfileUser] = useState<AdminReportUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const customSuspensionDays = getCustomSuspensionDays(suspensionDays);
  const canRestoreReportedAccount =
    report?.reported.accountStatus === "SUSPENDED" || report?.reported.accountStatus === "BANNED";

  const loadReport = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options;

      if (showLoading) {
        setIsLoadingReport(true);
      }

      setNotice(null);

      try {
        const response = await apiRequest<{ report: AdminReport }>(`/admin/reports/${reportId}`, {
          headers: authHeaders(token),
        });
        setReport(response.report);
      } catch (error) {
        setNotice(getUserErrorMessage(error));
      } finally {
        if (showLoading) {
          setIsLoadingReport(false);
        }
      }
    },
    [reportId, token]
  );

  function requestModeration(action: ReportModerationAction, durationDays?: number) {
    if (!report) {
      return;
    }

    setNotice(null);
    setPendingAction(buildModerationConfirmation(report, action, durationDays));
  }

  function requestDismissReport() {
    if (!report) {
      return;
    }

    setNotice(null);
    setPendingAction(buildDismissConfirmation(report));
  }

  async function confirmReportDecision() {
    if (!report || !pendingAction) {
      return;
    }

    setIsModerating(true);
    setNotice(null);

    try {
      const response =
        pendingAction.kind === "dismiss"
          ? await apiRequest<{ report: AdminReport }>(`/admin/reports/${report.id}/status`, {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({ status: "DISMISSED" }),
          })
          : await apiRequest<{ report: AdminReport }>(`/admin/reports/${report.id}/moderation`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              action: pendingAction.action,
              ...(pendingAction.durationDays ? { durationDays: pendingAction.durationDays } : {}),
              reason: moderationReason.trim() || undefined,
            }),
          });

      setReport(response.report);
      setPendingAction(null);
      setNotice(pendingAction.kind === "dismiss" ? "Report dismissed." : "Moderation action applied.");
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsModerating(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReport();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadReport]);

  return (
    <section>
      <ScreenHeader
        eyebrow="Report details"
        title=""
        leading={
          <Link
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 bg-white text-[#0d0d0d]"
            href="/reports"
            aria-label="Back to reports"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        }
        action={
          <button
            className="hidden h-10 items-center gap-2 rounded-full border border-black/8 px-4 text-sm font-medium md:inline-flex"
            type="button"
            onClick={() => void loadReport()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingReport ? (
          <div className="grid min-h-80 place-items-center rounded-[28px] border border-black/5">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading report</p>
            </div>
          </div>
        ) : report ? (
          <div className="mx-auto max-w-3xl">
            <article className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${getReportStatusClass(report.status)}`}>
                      {getReportStatusLabel(report.status)}
                    </span>
                    <span className="text-xs font-medium text-[#9a9a9a]">{formatDateTime(report.createdAt)}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold leading-tight text-[#0d0d0d]">{report.reason}</h2>
                  {report.details ? <p className="mt-3 text-sm leading-6 text-[#444444]">{report.details}</p> : null}
                </div>
              </div>
            </article>

            <ReportAccountsCard
              reporter={report.reporter}
              reported={report.reported}
              onSelectProfile={setSelectedProfileUser}
            />

            <section className="mt-4 rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Admin decisions</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px]">
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Reason
                  <input
                    className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    value={moderationReason}
                    onChange={(event) => setModerationReason(event.target.value)}
                    maxLength={500}
                    placeholder="Optional admin note"
                  />
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                  Days
                  <input
                    className="h-11 rounded-full border border-black/8 bg-white px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    type="number"
                    min={1}
                    max={365}
                    value={suspensionDays}
                    onChange={(event) => setSuspensionDays(event.target.value)}
                    placeholder="Custom"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <ActionButton
                  icon={X}
                  label="Dismiss"
                  disabled={isModerating || report.status === "DISMISSED" || report.status === "ACTIONED"}
                  onClick={requestDismissReport}
                />
                <ActionButton
                  icon={Timer}
                  label="Suspend 7d"
                  disabled={isModerating || report.reported.accountStatus === "DELETED"}
                  onClick={() => requestModeration("SUSPEND", 7)}
                />
                <ActionButton
                  icon={Timer}
                  label="Suspend custom"
                  disabled={isModerating || report.reported.accountStatus === "DELETED" || !customSuspensionDays}
                  onClick={() => {
                    if (customSuspensionDays) {
                      requestModeration("SUSPEND", customSuspensionDays);
                    }
                  }}
                />
                <ActionButton
                  icon={Ban}
                  label="Ban"
                  tone="danger"
                  disabled={isModerating || report.reported.accountStatus === "DELETED"}
                  onClick={() => requestModeration("BAN")}
                />
                <ActionButton
                  icon={RotateCcw}
                  label="Restore"
                  disabled={isModerating || !canRestoreReportedAccount}
                  onClick={() => requestModeration("RESTORE")}
                />
                <ActionButton
                  icon={Trash2}
                  label="Delete"
                  tone="solidDanger"
                  disabled={isModerating || report.reported.accountStatus === "DELETED"}
                  onClick={() => requestModeration("DELETE")}
                />
              </div>
            </section>
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
            <div>
              <AlertTriangle className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">Report not found</h2>
              <p className="mt-2 text-sm text-[#666666]">This report may have been removed.</p>
              <Link
                className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-5 text-sm font-medium"
                href="/reports"
              >
                Back to reports
              </Link>
            </div>
          </div>
        )}
      </div>

      {pendingAction ? (
        <ConfirmationModal
          action={pendingAction}
          isSubmitting={isModerating}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmReportDecision()}
        />
      ) : null}

      {selectedProfileUser ? (
        <AdminProfileModal user={selectedProfileUser} onClose={() => setSelectedProfileUser(null)} />
      ) : null}
    </section>
  );
}

function ReportListItem({ report }: { report: AdminReport }) {
  const detailsPreview = report.details?.trim();

  return (
    <Link
      className="group flex items-center gap-3 border-b border-black/5 px-4 py-4 text-left transition last:border-b-0 hover:bg-[#fafafa]"
      href={`/reports/${report.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${getReportStatusClass(report.status)}`}>
            {getReportStatusLabel(report.status)}
          </span>
          <span className="text-xs font-medium text-[#9a9a9a]">{formatDateTime(report.createdAt)}</span>
        </div>
        <h3 className="mt-3 truncate text-lg font-semibold text-[#0d0d0d]">{report.reason}</h3>
        {detailsPreview ? <p className="mt-1 truncate text-sm text-[#666666]">{detailsPreview}</p> : null}
        <div className="mt-3 grid gap-1.5 text-xs text-[#666666]">
          <p className="truncate">
            <span className="font-medium text-[#999999]">Reporter</span>{" "}
            <span className="font-medium text-[#0d0d0d]">{report.reporter.displayName}</span>
          </p>
          <p className="truncate">
            <span className="font-medium text-[#999999]">Reported</span>{" "}
            <span className="font-medium text-[#0d0d0d]">{report.reported.displayName}</span>
            <span className="ml-2 rounded-full bg-[#fafafa] px-2 py-0.5 text-[11px] font-medium text-[#777777]">
              {report.reported.accountStatus}
            </span>
          </p>
        </div>
      </div>
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#777777] transition group-hover:border-[#18E299] group-hover:text-[#0d0d0d]">
        <ChevronRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

function ReportAccountsCard({
  reporter,
  reported,
  onSelectProfile,
}: {
  reporter: AdminReportUser;
  reported: AdminReportUser;
  onSelectProfile: (user: AdminReportUser) => void;
}) {
  return (
    <section className="mt-4 rounded-[28px] border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-3">
        <ReportAccountButton
          user={reporter}
          label="Reporter"
          onClick={() => onSelectProfile(reporter)}
        />
        <ArrowRight className="size-4 shrink-0 text-[#b0b0b0]" aria-hidden="true" />
        <ReportAccountButton
          user={reported}
          label="Reported"
          onClick={() => onSelectProfile(reported)}
        />
      </div>
    </section>
  );
}

function ReportAccountButton({
  user,
  label,
  onClick,
}: {
  label: string;
  user: AdminReportUser;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] p-2 text-left transition hover:bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#18E299]"
      type="button"
      onClick={onClick}
      aria-label={`View ${label.toLowerCase()} profile: ${user.displayName}`}
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-[#d4fae8]">
        <ProfilePhotoImage
          photo={user.photos[0]}
          alt={`${user.displayName} profile`}
          variant="thumb"
          sizes="64px"
          iconSize="sm"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#0d0d0d]">{user.displayName}</span>
      </span>
    </button>
  );
}

function AdminProfileModal({ user, onClose }: { user: AdminReportUser; onClose: () => void }) {
  const primaryPhoto = user.photos[0];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <section className="max-h-[86dvh] w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="relative aspect-[1.08] min-h-65 bg-[#d4fae8]">
          <ProfilePhotoImage
            photo={primaryPhoto}
            alt={`${user.displayName} profile`}
            variant="full"
            sizes="min(100vw, 420px)"
            iconSize="lg"
            priority
          />
          <button
            className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-white/90 text-[#0d0d0d] shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            title="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-5 text-white">
            <h2 className="text-3xl font-semibold">
              {user.displayName}
              {user.age ? `, ${user.age}` : ""}
            </h2>
            <p className="mt-1 flex items-center gap-1 text-sm font-medium">
              <MapPin className="size-4" aria-hidden="true" />
              {formatLocation(user)}
            </p>
          </div>
        </div>

        <div className="max-h-[calc(86dvh-260px)] overflow-y-auto p-5">
          <div className="flex items-center gap-2 rounded-[18px] bg-[#fafafa] p-3 text-sm text-[#444444]">
            <Mail className="size-4 shrink-0 text-[#18E299]" aria-hidden="true" />
            <span className="min-w-0 truncate">{user.email}</span>
          </div>

          <div className="mt-4 grid gap-3">
            <ProfileField label="Bio" value={user.bio || "No bio added yet."} />
            <ProfileField label="Status" value={formatEnumLabel(user.connectionStatus) ?? "No connection status"} />
            <ProfileField label="Account" value={formatEnumLabel(user.accountStatus) ?? "Unknown"} />
            <ProfileField label="Subscription" value={formatEnumLabel(user.subscriptionStatus) ?? "Unknown"} />
            {user.suspendedUntil ? <ProfileField label="Suspended until" value={formatDateTime(user.suspendedUntil)} /> : null}
            {user.moderationReason ? <ProfileField label="Moderation note" value={user.moderationReason} /> : null}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Interests</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {user.interests.length > 0 ? (
                user.interests.slice(0, 12).map((interest) => (
                  <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
                    {interest}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[#777777]">No interests added yet.</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[#444444]">{value}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  disabled,
  onClick,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  tone?: "default" | "danger" | "solidDanger";
}) {
  const className =
    tone === "solidDanger"
      ? "bg-red-600 text-white"
      : tone === "danger"
        ? "border border-red-200 bg-white text-red-600"
        : "border border-black/[0.08] bg-white text-[#0d0d0d]";

  return (
    <button
      className={`inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-full px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-55 sm:px-4 ${className}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}

function ConfirmationModal({
  action,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  action: PendingReportDecision;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDanger = action.tone === "danger";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#0d0d0d]">{action.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#666666]">{action.body}</p>
          </div>
          <button
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close confirmation"
            title="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${isDanger ? "bg-red-600 text-white" : "bg-[#0d0d0d] text-white"
              }`}
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {action.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
