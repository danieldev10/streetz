"use client";

import { useEffect, useState } from "react";
import { Eye, Globe, Home, LogIn, UserCheck, Users } from "lucide-react";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { StatGridSkeleton } from "@/components/skeletons";
import { MetricGrid, type MetricCard } from "./metric-grid";

type Traffic = { visits: number; pageViews: number; landingViews: number; guestViews: number; loginViews: number; memberViews: number; trackedSince: string | null };
const periods = [{ value: "all", label: "All time" }, { value: "today", label: "Today" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }];

export function AdminTraffic({ token, revision }: { token: string; revision: number }) {
  const [period, setPeriod] = useState("all");
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      void apiRequest<Traffic>(`/admin/traffic?period=${period}`, { headers: authHeaders(token), signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) setTraffic(data); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(getUserErrorMessage(cause)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [period, token, revision]);
  const format = (count: number) => new Intl.NumberFormat("en-NG").format(count);
  const cards: MetricCard[] = traffic ? [
    { label: "Website visits", value: format(traffic.visits), helper: "New visit after 30 minutes inactive", icon: Globe, tone: "brand" },
    { label: "Page views", value: format(traffic.pageViews), helper: "Page openings and reloads", icon: Eye, tone: "info" },
    { label: "Landing page views", value: format(traffic.landingViews), helper: "Main Events page, guests and members", icon: Home, tone: "brand" },
    { label: "Guest views", value: format(traffic.guestViews), helper: "Page views while signed out", icon: Users, tone: "info" },
    { label: "Login page views", value: format(traffic.loginViews), helper: "Login screen openings", icon: LogIn, tone: "warning" },
    { label: "Member views", value: format(traffic.memberViews), helper: "Page views while signed in", icon: UserCheck, tone: "success" },
  ] : [];
  return <section aria-labelledby="website-traffic-title" className="mt-8">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="website-traffic-title" className="text-lg font-semibold">Website traffic</h2>
        <p className="mt-1 text-xs text-ink-600">Daily totals use Nigerian time (WAT). Admin activity is excluded.</p></div>
      <label className="flex items-center gap-2 text-xs text-ink-600">Period
        <select className="min-h-11 rounded-full border border-black/8 bg-surface px-3 text-sm text-ink" value={period} onChange={(event) => setPeriod(event.target.value)}>
          {periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
    {error ? <p role="alert" className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm text-brand-deep">{error}</p> : loading ? <StatGridSkeleton label="Loading website traffic" /> : <MetricGrid cards={cards} />}
    <p className="mt-3 text-xs leading-5 text-ink-600">
      {traffic?.trackedSince ? `Tracking since ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(traffic.trackedSince))}.` : "Tracking starts with the first visit."}
      {" "}Visits are browser sessions, not unique people. Guest and member views add up to page views; landing and login views are included in those totals.
    </p>
  </section>;
}
