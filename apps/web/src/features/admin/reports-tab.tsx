"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { apiRequest, authHeaders } from "@/lib/api";
import type { AdminReport, ReportStatus } from "@/lib/types";

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLocation(user: { city: string | null; state: string | null }) {
  return [user.city, user.state].filter(Boolean).join(", ") || "No location";
}

export function ReportsTab({ token }: { token: string }) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportFilter, setReportFilter] = useState<ReportStatus | "ALL">("OPEN");
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleReports = useMemo(() => {
    if (reportFilter === "ALL") {
      return reports;
    }

    return reports.filter((report) => report.status === reportFilter);
  }, [reportFilter, reports]);

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
        setNotice(error instanceof Error ? error.message : "Unable to load reports.");
      } finally {
        if (showLoading) {
          setIsLoadingReports(false);
        }
      }
    },
    [token]
  );

  async function updateReportStatus(report: AdminReport, status: ReportStatus) {
    if (report.status === status) {
      return;
    }

    setUpdatingReportId(report.id);
    setNotice(null);

    try {
      const response = await apiRequest<{ report: AdminReport }>(`/admin/reports/${report.id}/status`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ status }),
      });

      setReports((current) => current.map((item) => (item.id === report.id ? response.report : item)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update report.");
    } finally {
      setUpdatingReportId(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReports();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadReports]);

  return (
    <section>
      <ScreenHeader
        eyebrow="Reports"
        title="Member reports."
        action={
          <button
            className="hidden h-10 items-center gap-2 rounded-full border border-black/8 px-4 text-sm font-medium md:inline-flex"
            type="button"
            onClick={() => void loadReports()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className="flex flex-wrap justify-end">
          <div className="flex max-w-full overflow-x-auto rounded-full border border-black/8 bg-[#fafafa] p-1">
            {reportStatusOptions.map((status) => (
              <button
                key={status}
                type="button"
                className={`h-9 rounded-full px-3 text-xs font-medium transition ${
                  reportFilter === status ? "bg-[#0d0d0d] text-white" : "text-[#666666]"
                }`}
                onClick={() => setReportFilter(status)}
              >
                {reportStatusLabels[status]}
              </button>
            ))}
          </div>
        </div>

        {notice ? <p className="mt-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingReports ? (
          <div className="mt-4 grid min-h-64 place-items-center rounded-[28px] border border-black/5">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading reports</p>
            </div>
          </div>
        ) : visibleReports.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {visibleReports.map((report) => (
              <article
                key={report.id}
                className="rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${reportStatusClasses[report.status]}`}>
                        {reportStatusLabels[report.status]}
                      </span>
                      <span className="text-xs font-medium text-[#9a9a9a]">{formatDateTime(report.createdAt)}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold">{report.reason}</h3>
                  </div>

                  <select
                    className="h-10 rounded-full border border-black/8 bg-white px-3 text-xs font-medium outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                    value={report.status}
                    disabled={updatingReportId === report.id}
                    onChange={(event) => void updateReportStatus(report, event.target.value as ReportStatus)}
                    aria-label="Update report status"
                  >
                    {reportStatusOptions
                      .filter((status): status is ReportStatus => status !== "ALL")
                      .map((status) => (
                        <option key={status} value={status}>
                          {reportStatusLabels[status]}
                        </option>
                      ))}
                  </select>
                </div>

                {report.details ? <p className="mt-3 text-sm leading-6 text-[#444444]">{report.details}</p> : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ReportUserCard label="Reporter" user={report.reporter} />
                  <ReportUserCard label="Reported" user={report.reported} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid min-h-64 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
            <div>
              <AlertTriangle className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h3 className="mt-3 text-2xl font-semibold">No reports here</h3>
              <p className="mt-2 text-sm text-[#666666]">Reports with this status will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReportUserCard({
  label,
  user,
}: {
  label: string;
  user: {
    displayName: string;
    email: string;
    city: string | null;
    state: string | null;
    connectionStatus: string | null;
    subscriptionStatus?: string;
  };
}) {
  return (
    <div className="rounded-2xl bg-[#fafafa] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#9a9a9a]">{label}</p>
      <p className="mt-2 text-sm font-semibold">{user.displayName}</p>
      <p className="mt-1 truncate text-xs text-[#666666]">{user.email}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#666666]">{formatLocation(user)}</span>
        {user.connectionStatus ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#666666]">
            {user.connectionStatus.replaceAll("_", " ")}
          </span>
        ) : null}
        {user.subscriptionStatus ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#666666]">{user.subscriptionStatus}</span>
        ) : null}
      </div>
    </div>
  );
}
