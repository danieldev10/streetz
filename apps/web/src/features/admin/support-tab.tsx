"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, RefreshCw, Send } from "lucide-react";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type {
  SupportPriority,
  SupportRequest,
  SupportRequestCategory,
  SupportRequestStatus,
  SupportRequestSummary
} from "@/lib/types";
import {
  getSupportCategoryLabel,
  supportCategories,
  supportStatusLabels
} from "@/features/support/support-content";

const statuses: SupportRequestStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"];
const priorities: SupportPriority[] = ["URGENT", "HIGH", "NORMAL"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos"
  }).format(new Date(value));
}

function priorityClass(priority: SupportPriority) {
  if (priority === "URGENT") return "bg-red-50 text-red-700";
  if (priority === "HIGH") return "bg-amber-50 text-amber-800";
  return "bg-black/5 text-[#666666]";
}

export function SupportTab({ token }: { token: string }) {
  const [requests, setRequests] = useState<SupportRequestSummary[]>([]);
  const [selected, setSelected] = useState<SupportRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupportRequestStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SupportRequestCategory | "">("");
  const [priorityFilter, setPriorityFilter] = useState<SupportPriority | "">("");
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState<SupportRequestStatus>("WAITING_ON_USER");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [categoryFilter, priorityFilter, statusFilter]);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiRequest<SupportRequestSummary[]>(`/admin/support/requests${query}`, {
        headers: authHeaders(token)
      });
      setRequests(result);
    } catch (loadError) {
      setError(getUserErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [query, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  async function openRequest(requestId: string) {
    setIsLoadingDetail(true);
    setError(null);
    try {
      const request = await apiRequest<SupportRequest>(`/admin/support/requests/${requestId}`, {
        headers: authHeaders(token)
      });
      setSelected(request);
      setReplyStatus(request.status === "RESOLVED" ? "RESOLVED" : "WAITING_ON_USER");
    } catch (loadError) {
      setError(getUserErrorMessage(loadError));
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !reply.trim() || isReplying) return;
    setIsReplying(true);
    setError(null);
    try {
      const request = await apiRequest<SupportRequest>(
        `/admin/support/requests/${selected.id}/messages`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ message: reply.trim(), status: replyStatus })
        }
      );
      setSelected(request);
      setReply("");
      await loadRequests();
    } catch (replyError) {
      setError(getUserErrorMessage(replyError));
    } finally {
      setIsReplying(false);
    }
  }

  async function updateRequest(update: {
    status?: SupportRequestStatus;
    priority?: SupportPriority;
  }) {
    if (!selected || isUpdating) return;
    setIsUpdating(true);
    setError(null);
    try {
      const request = await apiRequest<SupportRequest>(`/admin/support/requests/${selected.id}`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(update)
      });
      setSelected(request);
      await loadRequests();
    } catch (updateError) {
      setError(getUserErrorMessage(updateError));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <section className="px-5 pb-28 pt-6 md:px-8 md:pb-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#777777]">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Support inbox</h1>
            <p className="mt-2 text-sm text-[#666666]">Review requests, reply by email and manage resolution status.</p>
          </div>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium"
            type="button"
            onClick={() => void loadRequests()}
            disabled={isLoading}
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-3 rounded-[22px] border border-black/[0.06] bg-white p-4 md:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#777777]">
            Status
            <select
              className="h-11 rounded-[14px] border border-black/[0.1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#0d0d0d]"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as SupportRequestStatus | "")}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{supportStatusLabels[status]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#777777]">
            Category
            <select
              className="h-11 rounded-[14px] border border-black/[0.1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#0d0d0d]"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as SupportRequestCategory | "")}
            >
              <option value="">All categories</option>
              {supportCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#777777]">
            Priority
            <select
              className="h-11 rounded-[14px] border border-black/[0.1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#0d0d0d]"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as SupportPriority | "")}
            >
              <option value="">All priorities</option>
              {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
        </div>

        {error ? <p className="mt-4 rounded-[16px] bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="overflow-hidden rounded-[24px] border border-black/[0.07] bg-white">
            <div className="flex items-center justify-between border-b border-black/[0.06] p-4">
              <span className="inline-flex items-center gap-2 font-semibold">
                <Inbox className="size-4" aria-hidden="true" />
                Requests
              </span>
              <span className="text-sm text-[#777777]">{requests.length}</span>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {isLoading ? (
                <div className="grid gap-3 p-4">
                  {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-black/5" />)}
                </div>
              ) : requests.length === 0 ? (
                <p className="p-7 text-center text-sm text-[#777777]">No requests match these filters.</p>
              ) : (
                requests.map((request) => (
                  <button
                    key={request.id}
                    className={`block w-full border-b border-black/[0.05] p-4 text-left transition last:border-b-0 hover:bg-[#fafafa] ${
                      selected?.id === request.id ? "bg-[#f5f5f5]" : ""
                    }`}
                    type="button"
                    onClick={() => void openRequest(request.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[#777777]">{request.reference}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityClass(request.priority)}`}>
                        {request.priority}
                      </span>
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px]">{supportStatusLabels[request.status]}</span>
                    </div>
                    <h2 className="mt-2 truncate font-semibold">{request.subject}</h2>
                    <p className="mt-1 truncate text-sm text-[#777777]">{request.displayName} · {getSupportCategoryLabel(request.category)}</p>
                    <p className="mt-2 text-xs text-[#999999]">{formatDate(request.lastMessageAt)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            {isLoadingDetail ? <div className="h-[560px] animate-pulse rounded-[24px] bg-black/5" /> : null}
            {!isLoadingDetail && !selected ? (
              <div className="grid min-h-80 place-items-center rounded-[24px] border border-dashed border-black/10 bg-white p-7 text-center text-sm text-[#777777]">
                Choose a request to open the conversation.
              </div>
            ) : null}
            {!isLoadingDetail && selected ? (
              <section className="overflow-hidden rounded-[24px] border border-black/[0.07] bg-white">
                <div className="border-b border-black/[0.06] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#777777]">{selected.reference}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClass(selected.priority)}`}>
                      {selected.priority}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold">{selected.subject}</h2>
                  <p className="mt-1 text-sm text-[#666666]">{selected.displayName} · {selected.email}</p>
                  <p className="mt-1 text-sm text-[#777777]">{getSupportCategoryLabel(selected.category)}</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#777777]">
                      Status
                      <select
                        className="h-10 rounded-[12px] border border-black/[0.1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#0d0d0d]"
                        value={selected.status}
                        disabled={isUpdating}
                        onChange={(event) => void updateRequest({ status: event.target.value as SupportRequestStatus })}
                      >
                        {statuses.map((status) => <option key={status} value={status}>{supportStatusLabels[status]}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#777777]">
                      Priority
                      <select
                        className="h-10 rounded-[12px] border border-black/[0.1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#0d0d0d]"
                        value={selected.priority}
                        disabled={isUpdating}
                        onChange={(event) => void updateRequest({ priority: event.target.value as SupportPriority })}
                      >
                        {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="grid max-h-[48vh] gap-4 overflow-y-auto bg-[#fafafa] p-5">
                  {selected.messages.map((message) => {
                    const fromAdmin = message.authorType === "ADMIN" || message.authorType === "SYSTEM";
                    return (
                      <article
                        key={message.id}
                        className={`max-w-[90%] rounded-[18px] p-4 ${
                          fromAdmin
                            ? "justify-self-end bg-[#0d0d0d] text-white"
                            : "justify-self-start border border-black/[0.06] bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap gap-2 text-xs">
                          <strong>{message.authorName}</strong>
                          <span className={fromAdmin ? "text-white/60" : "text-[#888888]"}>{formatDate(message.createdAt)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                      </article>
                    );
                  })}
                </div>

                {selected.status !== "CLOSED" ? (
                  <form className="border-t border-black/[0.06] p-4" onSubmit={submitReply}>
                    <textarea
                      className="min-h-24 w-full resize-y rounded-[16px] border border-black/[0.1] px-4 py-3 text-sm outline-none focus:border-black/30"
                      maxLength={4_000}
                      placeholder="Reply to this request"
                      required
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <select
                        className="h-10 rounded-full border border-black/[0.1] bg-white px-3 text-sm"
                        value={replyStatus}
                        onChange={(event) => setReplyStatus(event.target.value as SupportRequestStatus)}
                      >
                        {statuses.filter((status) => status !== "CLOSED").map((status) => (
                          <option key={status} value={status}>{supportStatusLabels[status]}</option>
                        ))}
                      </select>
                      <button
                        className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-semibold text-white disabled:opacity-40"
                        type="submit"
                        disabled={!reply.trim() || isReplying}
                      >
                        <Send className="size-4" aria-hidden="true" />
                        {isReplying ? "Sending…" : "Send reply"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="border-t border-black/[0.06] p-4 text-center text-sm text-[#777777]">Reopen the request to reply.</p>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
