"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { CHAT_PANEL_HEIGHT } from "@/lib/chat-layout";
import type { SupportPriority, SupportRequest, SupportRequestStatus } from "@/lib/types";
import { SupportThread } from "@/features/support/support-thread";
import { adminSupportStatusLabels, supportPriorities, supportStatuses } from "./support-ui";

function AdminSupportConversation({ requestId, token, backHref }: {
  requestId: string;
  token: string;
  backHref: string;
}) {
  const [request, setRequest] = useState<SupportRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReplying, setIsReplying] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyStatus, setReplyStatus] = useState<SupportRequestStatus>("WAITING_ON_USER");
  const endpoint = `/admin/support/requests/${encodeURIComponent(requestId)}`;

  const loadRequest = useCallback(async (signal?: AbortSignal) => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const result = await apiRequest<SupportRequest>(endpoint, { headers: authHeaders(token), signal });
      if (!signal?.aborted) {
        setRequest(result);
        setReplyStatus(result.status === "RESOLVED" ? "RESOLVED" : "WAITING_ON_USER");
      }
    } catch (error) {
      if (!signal?.aborted) setLoadError(getUserErrorMessage(error));
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [endpoint, token]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadRequest(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadRequest]);

  async function reply(message: string) {
    setIsReplying(true);
    setReplyError(null);
    try {
      const result = await apiRequest<SupportRequest>(`${endpoint}/messages`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ message, status: replyStatus }),
      });
      setRequest(result);
    } catch (error) {
      setReplyError(getUserErrorMessage(error));
      throw error;
    } finally {
      setIsReplying(false);
    }
  }

  async function updateRequest(update: { status?: SupportRequestStatus; priority?: SupportPriority }) {
    if (isUpdating || isReplying || isRefreshing) return;
    setIsUpdating(true);
    setActionError(null);
    try {
      const result = await apiRequest<SupportRequest>(endpoint, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(update),
      });
      setRequest(result);
      if (update.status) setReplyStatus(result.status === "RESOLVED" ? "RESOLVED" : "WAITING_ON_USER");
    } catch (error) {
      setActionError(getUserErrorMessage(error));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <section className="bg-surface-sunken md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl">
        {isLoading ? (
          <div className={`${CHAT_PANEL_HEIGHT} animate-pulse bg-black/5 md:rounded-[28px]`} role="status" aria-label="Loading support conversation" />
        ) : request ? (
          <SupportThread
            request={request}
            isReplying={isReplying || isUpdating || isRefreshing}
            error={replyError}
            onReply={reply}
            backHref={backHref}
            backLabel="Back to support inbox"
            variant="conversation"
            viewerAuthorType="ADMIN"
            closedMessage="Reopen this request in Manage request to reply."
            headerContent={
              <>
                <p className="mt-2 truncate text-sm text-ink-600" title={`${request.displayName} · ${request.email}`}>
                  {request.displayName} · {request.email}
                </p>
                <div className="mt-3 flex items-start gap-2">
                  <details className="group min-w-0 flex-1 rounded-2xl border border-black/[0.07]">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-medium [&::-webkit-details-marker]:hidden">
                      Manage request
                      {isUpdating ? <LoaderCircle className="size-3.5 animate-spin" aria-label="Saving changes" /> : <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden="true" />}
                    </summary>
                    <div className="grid grid-cols-2 gap-3 border-t border-black/[0.06] p-3">
                      <label className="grid min-w-0 gap-1.5 text-xs text-ink-500">
                        Request status
                        <select
                          className="h-10 min-w-0 rounded-xl border border-black/10 bg-surface px-2 text-sm text-ink"
                          value={request.status}
                          disabled={isUpdating || isReplying || isRefreshing}
                          onChange={(event) => void updateRequest({ status: event.target.value as SupportRequestStatus })}
                        >
                          {supportStatuses.map((status) => <option key={status} value={status}>{adminSupportStatusLabels[status]}</option>)}
                        </select>
                      </label>
                      <label className="grid min-w-0 gap-1.5 text-xs text-ink-500">
                        Request priority
                        <select
                          className="h-10 min-w-0 rounded-xl border border-black/10 bg-surface px-2 text-sm text-ink"
                          value={request.priority}
                          disabled={isUpdating || isReplying || isRefreshing}
                          onChange={(event) => void updateRequest({ priority: event.target.value as SupportPriority })}
                        >
                          {supportPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                        </select>
                      </label>
                    </div>
                  </details>
                  <ActionButton
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-ink-500"
                    type="button"
                    aria-label="Refresh conversation"
                    icon={<RefreshCw className="size-4" aria-hidden="true" />}
                    disabled={isUpdating || isReplying}
                    isLoading={isRefreshing}
                    onClick={() => loadRequest()}
                  />
                </div>
                {loadError || actionError ? <p className="mt-2 text-xs text-danger" role="alert">{loadError || actionError}</p> : null}
              </>
            }
            replyControls={
              <label className="flex items-center gap-2 text-xs text-ink-500">
                <span className="shrink-0">After reply</span>
                <select
                  className="h-8 min-w-0 flex-1 rounded-xl border border-black/10 bg-surface px-2 text-xs text-ink"
                  value={replyStatus}
                  disabled={isUpdating || isReplying || isRefreshing}
                  onChange={(event) => setReplyStatus(event.target.value as SupportRequestStatus)}
                >
                  {supportStatuses.filter((status) => status !== "CLOSED").map((status) => <option key={status} value={status}>{adminSupportStatusLabels[status]}</option>)}
                </select>
              </label>
            }
          />
        ) : (
          <div className="px-5 py-8 md:px-0">
            <section className="rounded-[24px] border border-black/[0.07] bg-surface p-6 text-center">
              <h1 className="text-xl font-semibold">Could not open this request</h1>
              <p className="mt-2 text-sm text-ink-600" role="alert">{loadError}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link className="inline-flex h-11 items-center rounded-full border border-black/10 px-4 text-sm" href={backHref}>Back to support inbox</Link>
                <ActionButton className="inline-flex h-11 items-center rounded-full bg-ink px-4 text-sm text-white" type="button" onClick={() => loadRequest()}>Try again</ActionButton>
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminSupportRequestClient({ requestId, backHref }: { requestId: string; backHref: string }) {
  return (
    <AuthenticatedRoute activeTab="support" adminOnly>
      {({ token }) => <AdminSupportConversation key={requestId} requestId={requestId} token={token} backHref={backHref} />}
    </AuthenticatedRoute>
  );
}
