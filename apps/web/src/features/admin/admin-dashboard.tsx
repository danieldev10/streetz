"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  CalendarDays,
  Database,
  Flag,
  Heart,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Ticket,
  UserCheck,
  Users,
} from "lucide-react";
import { StatGridSkeleton } from "@/components/skeletons";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { AdminMetrics } from "@/lib/types";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatNaira(valueKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(valueKobo / 100);
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

  const cards = useMemo(() => {
    if (!metrics) {
      return [];
    }

    const metricCards = [
      {
        label: "Members",
        value: formatNumber(metrics.members.total),
        helper: "Registered member accounts",
        icon: Users,
      },
      {
        label: "Active members",
        value: formatNumber(metrics.members.activeSubscribers),
        helper: `${formatPercent(metrics.members.activeSubscribers, metrics.members.total)} of members`,
        icon: UserCheck,
      },
      {
        label: "Profiles ready",
        value: formatNumber(metrics.members.completedProfiles),
        helper: `${formatPercent(metrics.members.completedProfiles, metrics.members.total)} completion`,
        icon: Activity,
      },
      {
        label: "Matches",
        value: formatNumber(metrics.discovery.activeMatches),
        helper: "Active discovery matches",
        icon: Heart,
      },
      {
        label: "Event chats",
        value: formatNumber(metrics.rooms.total),
        helper: "Event-linked chat spaces",
        icon: MessageCircle,
      },
      {
        label: "Event chat members",
        value: formatNumber(metrics.rooms.members),
        helper: "Joined room memberships",
        icon: Users,
      },
      {
        label: "Event chat messages",
        value: formatNumber(metrics.rooms.messages),
        helper: "Visible member messages",
        icon: MessagesSquare,
      },
      {
        label: "Live events",
        value: formatNumber(metrics.events.published),
        helper: "Published event listings",
        icon: CalendarDays,
      },
      {
        label: "Tickets",
        value: formatNumber(metrics.events.ticketsBooked),
        helper: "Reserved, paid, or checked in",
        icon: Ticket,
      },
      {
        label: "Ticket revenue",
        value: formatNaira(metrics.events.ticketRevenueKobo),
        helper: "Successful ticket payments",
        icon: Banknote,
      },
      {
        label: "Open reports",
        value: formatNumber(metrics.reports.open),
        helper: `${formatNumber(metrics.reports.total)} total reports`,
        icon: Flag,
      },
    ];

    if (metrics.system) {
      metricCards.push(
        {
          label: "Database pool",
          value: `${metrics.system.databasePool.activeConnections}/${metrics.system.databasePool.maxConnections}`,
          helper: `${metrics.system.databasePool.idleConnections} idle · ${metrics.system.databasePool.utilizationPercent}% in use`,
          icon: Database,
        },
        {
          label: "Database wait queue",
          value: formatNumber(metrics.system.databasePool.waitingRequests),
          helper: "Requests waiting for a connection",
          icon: Activity,
        },
        {
          label: "API memory",
          value: `${Math.round(metrics.system.process.rssBytes / 1024 / 1024)} MB`,
          helper: `${Math.round(metrics.system.process.heapUsedBytes / 1024 / 1024)} MB JavaScript heap used`,
          icon: Activity,
        }
      );
    }

    return metricCards;
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
      <h1 className="sr-only">Admin dashboard</h1>
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <div className="mb-4 hidden items-center justify-end md:flex">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full border border-black/8 px-4 text-sm font-medium"
            type="button"
            onClick={() => void loadMetrics()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {notice ? <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {isLoadingMetrics ? (
          <StatGridSkeleton label="Loading metrics" />
        ) : metrics ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <article
                key={card.label}
                className="rounded-3xl border border-black/5 bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink-600">{card.label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-normal text-ink">{card.value}</p>
                  </div>
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
                    <card.icon className="size-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-ink-600">{card.helper}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-105 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
            <div>
              <Activity className="mx-auto size-8 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No metrics available</h2>
              <p className="mt-2 text-sm text-ink-600">Try refreshing the admin overview.</p>
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/8 px-5 text-sm font-medium"
                type="button"
                onClick={() => void loadMetrics()}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
