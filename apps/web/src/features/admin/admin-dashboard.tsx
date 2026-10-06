"use client";

import { ActionButton } from "@/components/action-button";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  CalendarDays,
  Flag,
  Heart,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Ticket,
  UserCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatGridSkeleton } from "@/components/skeletons";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { AdminMetrics } from "@/lib/types";

const metricTones = {
  brand: { card: "border-brand/10 to-brand-wash", icon: "bg-brand-tint text-brand-deep" },
  info: { card: "border-info/10 to-info-tint/40", icon: "bg-info-tint text-info" },
  success: { card: "border-success/10 to-success-tint/40", icon: "bg-success-tint text-success-deep" },
  warning: { card: "border-warning/10 to-warning-tint/50", icon: "bg-warning-tint text-warning" },
};

type MetricCard = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: keyof typeof metricTones;
  fullValue?: string;
};

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
        label: "Matches",
        value: formatNumber(metrics.discovery.activeMatches),
        helper: "Active discovery matches",
        icon: Heart,
        tone: "brand",
      },
      {
        label: "Event chats",
        value: formatNumber(metrics.rooms.total),
        helper: "Event-linked chat spaces",
        icon: MessageCircle,
        tone: "info",
      },
      {
        label: "Event chat members",
        value: formatNumber(metrics.rooms.members),
        helper: "Joined room memberships",
        icon: Users,
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
        value: formatNaira(metrics.events.ticketRevenueKobo, true),
        fullValue: formatNaira(metrics.events.ticketRevenueKobo),
        helper: "Successful ticket payments",
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
            onClick={() => loadMetrics()}
          >
            <span className="hidden sm:inline">Refresh</span>
          </ActionButton>
        </div>

        {notice ? <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {isLoadingMetrics ? (
          <StatGridSkeleton label="Loading metrics" />
        ) : metrics ? (
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => (
              <article
                key={card.label}
                className={`min-w-0 rounded-[20px] border bg-linear-to-br from-surface p-3 shadow-[0_2px_8px_rgba(0,0,0,0.025)] sm:p-4 ${metricTones[card.tone].card}`}
              >
                <div className="flex min-h-8 items-center justify-between gap-2">
                  <p className="min-w-0 text-xs font-medium leading-4 text-ink-600">{card.label}</p>
                  <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-xl ${metricTones[card.tone].icon}`}>
                    <card.icon className="size-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink tabular-nums sm:text-[28px]" title={card.fullValue}>
                  {card.fullValue ? <><span aria-hidden="true">{card.value}</span><span className="sr-only">{card.fullValue}</span></> : card.value}
                </p>
                <p className="mt-2 text-[11px] leading-4 text-ink-600">{card.helper}</p>
              </article>
            ))}
          </div>
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
                onClick={() => loadMetrics()}
              >
                Refresh
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
