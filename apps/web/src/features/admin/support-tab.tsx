"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { SupportRequestSummary } from "@/lib/types";
import { getSupportCategoryLabel, supportCategories } from "@/features/support/support-content";
import { adminSupportQuery, adminSupportStatusLabels, formatSupportDate, getAdminSupportFilters, supportPriorities, supportPriorityClass, supportStatuses } from "./support-ui";

export function SupportTab({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = getAdminSupportFilters(searchParams);
  const query = adminSupportQuery(filters);
  const [requests, setRequests] = useState<SupportRequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiRequest<SupportRequestSummary[]>(`/admin/support/requests${query}`, {
        headers: authHeaders(token),
        signal,
      });
      if (!signal?.aborted) setRequests(result);
    } catch (loadError) {
      if (!signal?.aborted) setError(getUserErrorMessage(loadError));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [query, token]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadRequests(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadRequests]);

  function changeFilter(name: keyof typeof filters, value: string) {
    const params = new URLSearchParams(query);
    if (value) params.set(name, value);
    else params.delete(name);
    router.replace(`/admin/support${adminSupportQuery(getAdminSupportFilters(params))}`, { scroll: false });
  }

  return (
    <section className="px-5 pb-8 pt-6 md:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Support inbox</h1>
            <p className="mt-1 text-sm text-ink-600">Open a request to view its conversation.</p>
          </div>
          <ActionButton
            isLoading={isLoading}
            icon={<RefreshCw className="size-4" aria-hidden="true" />}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-ink-600 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm"
            type="button"
            aria-label="Refresh support inbox"
            onClick={() => loadRequests()}
          >
            <span className="hidden sm:inline">Refresh</span>
          </ActionButton>
        </div>

        <div className="mt-5 grid gap-3 rounded-[22px] border border-black/[0.06] bg-surface p-4 sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-medium text-ink-500">
            Status
            <select
              className="h-11 min-w-0 rounded-[14px] border border-black/[0.1] bg-surface px-3 text-sm text-ink"
              value={filters.status}
              onChange={(event) => changeFilter("status", event.target.value)}
            >
              <option value="">All statuses</option>
              {supportStatuses.map((status) => <option key={status} value={status}>{adminSupportStatusLabels[status]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-ink-500">
            Category
            <select
              className="h-11 min-w-0 rounded-[14px] border border-black/[0.1] bg-surface px-3 text-sm text-ink"
              value={filters.category}
              onChange={(event) => changeFilter("category", event.target.value)}
            >
              <option value="">All categories</option>
              {supportCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-ink-500">
            Priority
            <select
              className="h-11 min-w-0 rounded-[14px] border border-black/[0.1] bg-surface px-3 text-sm text-ink"
              value={filters.priority}
              onChange={(event) => changeFilter("priority", event.target.value)}
            >
              <option value="">All priorities</option>
              {supportPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-danger-tint p-4 text-sm text-danger" role="alert">{error}</p> : null}

        <section className="mt-5 overflow-hidden rounded-[24px] border border-black/[0.07] bg-surface" aria-label="Support requests">
          <div className="flex items-center justify-between border-b border-black/[0.06] p-4">
            <h2 className="inline-flex items-center gap-2 font-semibold"><Inbox className="size-4" aria-hidden="true" />Requests</h2>
            <span className="text-sm text-ink-500">{isLoading ? "…" : requests.length}</span>
          </div>
          {isLoading ? (
            <div className="grid gap-3 p-4" role="status" aria-label="Loading support requests">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-black/5" aria-hidden="true" />)}
            </div>
          ) : error ? (
            <div className="p-7 text-center"><ActionButton className="rounded-full border border-black/10 px-4 py-2 text-sm" type="button" onClick={() => loadRequests()}>Try again</ActionButton></div>
          ) : requests.length === 0 ? (
            <p className="p-7 text-center text-sm text-ink-500">No requests match these filters.</p>
          ) : requests.map((request) => (
            <Link
              key={request.id}
              className="flex items-center gap-3 border-b border-black/[0.05] p-4 transition last:border-b-0 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
              href={`/admin/support/requests/${encodeURIComponent(request.id)}${query}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-ink-500">{request.reference}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${supportPriorityClass(request.priority)}`}>{request.priority}</span>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px]">{adminSupportStatusLabels[request.status]}</span>
                </div>
                <h3 className="mt-2 truncate font-semibold">{request.subject}</h3>
                <p className="mt-1 truncate text-sm text-ink-500">{request.displayName} · {getSupportCategoryLabel(request.category)}</p>
                <p className="mt-2 text-xs text-ink-400">{formatSupportDate(request.lastMessageAt)}</p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden="true" />
            </Link>
          ))}
        </section>
      </div>
    </section>
  );
}
