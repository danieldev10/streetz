"use client";

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
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
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

    return [
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
        label: "Rooms",
        value: formatNumber(metrics.rooms.total),
        helper: "Admin-created public rooms",
        icon: MessageCircle,
      },
      {
        label: "Room members",
        value: formatNumber(metrics.rooms.members),
        helper: "Joined room memberships",
        icon: Users,
      },
      {
        label: "Room messages",
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
      <ScreenHeader
        eyebrow="Metrics"
        title=""
        action={
          <button
            className="hidden h-10 items-center gap-2 rounded-full border border-black/8 px-4 text-sm font-medium md:inline-flex"
            type="button"
            onClick={() => void loadMetrics()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingMetrics ? (
          <LoadingState label="Loading metrics" className="min-h-105 rounded-[28px] border border-black/5" />
        ) : metrics ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <article
                key={card.label}
                className="rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#666666]">{card.label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-normal text-[#0d0d0d]">{card.value}</p>
                  </div>
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-[#d4fae8] text-[#0b7a50]">
                    <card.icon className="size-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-[#666666]">{card.helper}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-105 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
            <div>
              <Activity className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No metrics available</h2>
              <p className="mt-2 text-sm text-[#666666]">Try refreshing the admin overview.</p>
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
