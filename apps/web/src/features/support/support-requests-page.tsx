"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, LockKeyhole, Send } from "lucide-react";
import { useSession } from "@/components/app/session-provider";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { SupportRequest, SupportRequestSummary } from "@/lib/types";
import {
  getSupportCategoryLabel,
  supportStatusLabels,
} from "./support-content";
import { SupportShell } from "./support-shell";
import { SupportThread } from "./support-thread";

function formatListDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export function SupportRequestsPage() {
  const { status, token, user } = useSession();
  const [requests, setRequests] = useState<SupportRequestSummary[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(null);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  const isMember = status === "authenticated" && Boolean(token && user);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    let cancelled = false;
    apiRequest<SupportRequestSummary[]>("/support/requests/me", {
      headers: authHeaders(token),
    })
      .then((result) => {
        if (!cancelled) setRequests(result);
      })
      .catch((error) => {
        if (!cancelled) setRequestError(getUserErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRequests(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  async function openRequest(requestId: string) {
    if (!token) return;
    setIsLoadingThread(true);
    setRequestError(null);
    try {
      const request = await apiRequest<SupportRequest>(
        `/support/requests/me/${requestId}`,
        {
          headers: authHeaders(token),
        },
      );
      setSelectedRequest(request);
    } catch (error) {
      setRequestError(getUserErrorMessage(error));
    } finally {
      setIsLoadingThread(false);
    }
  }

  async function replyToRequest(message: string) {
    if (!token || !selectedRequest) return;
    setIsReplying(true);
    setReplyError(null);
    try {
      const request = await apiRequest<SupportRequest>(
        `/support/requests/me/${selectedRequest.id}/messages`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ message }),
        },
      );
      setSelectedRequest(request);
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: request.status,
                lastMessageAt: request.lastMessageAt,
                latestMessage: request.messages.at(-1)
                  ? {
                      body: request.messages.at(-1)!.body,
                      createdAt: request.messages.at(-1)!.createdAt,
                      authorType: request.messages.at(-1)!.authorType,
                    }
                  : null,
              }
            : item,
        ),
      );
    } catch (error) {
      setReplyError(getUserErrorMessage(error));
      throw error;
    } finally {
      setIsReplying(false);
    }
  }

  return (
    <SupportShell maxWidth="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#777777]">
            Support centre
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666666]">
            View replies and continue your private conversations with the support team.
          </p>
        </div>
        <Link
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-semibold text-white"
          href="/support/contact"
        >
          <Send className="size-4" aria-hidden="true" />
          New request
        </Link>
      </div>

      {status === "checking" ? (
        <div className="mt-6 h-28 animate-pulse rounded-[24px] bg-black/5" />
      ) : null}

      {status !== "checking" && !isMember ? (
        <section className="mt-6 rounded-[24px] border border-black/[0.07] bg-white p-6">
          <LockKeyhole className="size-5" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">Guest requests stay private</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666666]">
            Open the secure link in the email we sent after you contacted support. That link lets
            you read replies and continue the conversation without creating an account.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              className="inline-flex h-11 items-center rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
              href="/support/contact"
            >
              Contact us
            </Link>
            <Link
              className="inline-flex h-11 items-center rounded-full border border-black/[0.08] px-5 text-sm font-medium"
              href="/?mode=login"
            >
              Log in
            </Link>
          </div>
        </section>
      ) : null}

      {isMember ? (
        <section className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">My support requests</h2>
            <span className="text-sm text-[#777777]">{requests.length} total</span>
          </div>

          {requestError ? (
            <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
              {requestError}
            </p>
          ) : null}
          {isLoadingRequests ? (
            <div className="mt-4 h-24 animate-pulse rounded-[24px] bg-black/5" />
          ) : requests.length === 0 ? (
            <div className="mt-4 rounded-[24px] border border-dashed border-black/10 bg-white p-6 text-sm text-[#666666]">
              You have not sent any support requests yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {requests.map((request) => (
                <button
                  key={request.id}
                  className="flex items-center gap-4 rounded-[22px] border border-black/[0.07] bg-white p-4 text-left transition hover:border-black/20"
                  type="button"
                  onClick={() => void openRequest(request.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[#777777]">
                        {request.reference}
                      </span>
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium">
                        {supportStatusLabels[request.status]}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate font-semibold">{request.subject}</h3>
                    <p className="mt-1 truncate text-sm text-[#777777]">
                      {getSupportCategoryLabel(request.category)} ·{" "}
                      {formatListDate(request.lastMessageAt)}
                    </p>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-[#999999]"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          )}

          {isLoadingThread ? (
            <div className="mt-5 h-80 animate-pulse rounded-[24px] bg-black/5" />
          ) : null}
          {!isLoadingThread && selectedRequest ? (
            <div className="mt-5">
              <SupportThread
                request={selectedRequest}
                isReplying={isReplying}
                error={replyError}
                onReply={replyToRequest}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </SupportShell>
  );
}
