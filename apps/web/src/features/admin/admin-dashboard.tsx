"use client";

import { ActionButton } from "@/components/action-button";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  CalendarDays,
  Flag,
  MessagesSquare,
  RefreshCw,
  Ticket,
  UserCheck,
  Users,
} from "lucide-react";
import { StatGridSkeleton } from "@/components/skeletons";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { AdminMetrics } from "@/lib/types";
import { MetricGrid, type MetricCard } from "./metric-grid";
import { AdminTraffic } from "./admin-traffic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatNaira(valueKobo: number, compact = false) {
  const valueNaira = valueKobo / 100;
  const useCompact = compact && valueNaira >= 1_000_000;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: useCompact ? "compact" : "standard",
    maximumFractionDigits: useCompact ? 1 : 0,
  }).format(valueNaira);
}

function formatPercent(value: number, total: number) {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

export function AdminDashboard({ token }: { token: string }) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [trafficRevision, setTrafficRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const cards = useMemo<MetricCard[]>(() => {
    if (!metrics) {
      return [];
    }

    return [
      {
        label: "Members",
        value: formatNumber(metrics.members.total),
        helper: "Registered member accounts",
        icon: Users,
        tone: "brand",
      },
      {
        label: "Active members",
        value: formatNumber(metrics.members.activeSubscribers),
        helper: `${formatPercent(metrics.members.activeSubscribers, metrics.members.total)} of members`,
        icon: UserCheck,
        tone: "success",
      },
      {
        label: "Profiles ready",
        value: formatNumber(metrics.members.completedProfiles),
        helper: `${formatPercent(metrics.members.completedProfiles, metrics.members.total)} completion`,
        icon: Activity,
        tone: "info",
      },
      {
        label: "Event chat messages",
        value: formatNumber(metrics.rooms.messages),
        helper: "Visible member messages",
        icon: MessagesSquare,
        tone: "info",
      },
      {
        label: "Live events",
        value: formatNumber(metrics.events.published),
        helper: "Published event listings",
        icon: CalendarDays,
        tone: "brand",
      },
      {
        label: "Tickets",
        value: formatNumber(metrics.events.ticketsBooked),
        helper: "Reserved, paid, or checked in",
        icon: Ticket,
        tone: "warning",
      },
      {
        label: "Ticket revenue",
        value: metrics.revenue ? formatNaira(metrics.revenue.ticketRevenueKobo, true) : "—",
        fullValue: metrics.revenue ? formatNaira(metrics.revenue.ticketRevenueKobo) : undefined,
        helper: "Successful live ticket payments",
        icon: Banknote,
        tone: "success",
      },
      {
        label: "Sub revenue",
        value: metrics.revenue ? formatNaira(metrics.revenue.subscriptionRevenueKobo, true) : "—",
        fullValue: metrics.revenue ? formatNaira(metrics.revenue.subscriptionRevenueKobo) : undefined,
        helper: "Successful live subscriptions",
        icon: Banknote,
        tone: "success",
      },
      {
        label: "Open reports",
        value: formatNumber(metrics.reports.open),
        helper: `${formatNumber(metrics.reports.total)} total reports`,
        icon: Flag,
        tone: "warning",
      },
    ];
  }, [metrics]);

  const loadMetrics = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options;

      if (showLoading) {
        setIsLoadingMetrics(true);
      }

      setNotice(null);

      try {
        const response = await apiRequest<AdminMetrics>("/admin/metrics", {
          headers: authHeaders(token),
        });
        setMetrics(response);
      } catch (error) {
        setNotice(getUserErrorMessage(error));
      } finally {
        if (showLoading) {
          setIsLoadingMetrics(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMetrics();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMetrics]);

  return (
    <section>
      <div className="px-5 pb-8 pt-5 md:px-8 md:pt-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-1 text-xs text-ink-600">Members, events and activity</p>
          </div>
          <ActionButton
            isLoading={isLoadingMetrics} icon={<RefreshCw className="size-4" aria-hidden="true" />}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 bg-surface text-ink-600 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm sm:font-medium"
            type="button"
            aria-label="Refresh metrics"
            onClick={() => { void loadMetrics(); setTrafficRevision((value) => value + 1); }}
          >
            <span className="hidden sm:inline">Refresh</span>
          </ActionButton>
        </div>

        {notice ? <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {isLoadingMetrics ? (
          <StatGridSkeleton label="Loading metrics" />
        ) : metrics ? (
          <MetricGrid cards={cards} />
        ) : (
          <div className="grid min-h-105 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
            <div>
              <Activity className="mx-auto size-8 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No metrics available</h2>
              <p className="mt-2 text-sm text-ink-600">Try refreshing the admin overview.</p>
              <ActionButton
                isLoading={isLoadingMetrics} icon={<RefreshCw className="size-4" aria-hidden="true" />}
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/8 px-5 text-sm font-medium"
                type="button"
                onClick={() => { void loadMetrics(); setTrafficRevision((value) => value + 1); }}
              >
                Refresh
              </ActionButton>
            </div>
          </div>
        )}
        <AdminTraffic token={token} revision={trafficRevision} />
      </div>
    </section>
  );
}
