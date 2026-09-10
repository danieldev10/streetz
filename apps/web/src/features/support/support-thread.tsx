"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Send } from "lucide-react";
import type { SupportMessageAuthorType, SupportRequest } from "@/lib/types";
import { getSupportCategoryLabel, supportStatusLabels } from "./support-content";
import { CHAT_PANEL_HEIGHT } from "@/lib/chat-layout";
import { useChatAutoScroll } from "@/lib/use-chat-autoscroll";

function formatSupportDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos"
  }).format(new Date(value));
}

function statusClass(status: SupportRequest["status"]) {
  if (status === "RESOLVED") return "bg-success-tint text-success";
  if (status === "CLOSED") return "bg-black/5 text-ink-600";
  if (status === "WAITING_ON_USER") return "bg-warning-tint text-warning";
  if (status === "IN_PROGRESS") return "bg-info-tint text-info";
  return "bg-violet-50 text-violet-700";
}

export function SupportThread({
  request,
  isReplying,
  error,
  onReply,
  backHref,
  backLabel = "Back to requests",
  variant = "card",
  viewerAuthorType,
}: {
  request: SupportRequest;
  isReplying: boolean;
  error?: string | null;
  onReply: (message: string) => Promise<void>;
  backHref?: string;
  backLabel?: string;
  variant?: "card" | "conversation";
  viewerAuthorType: Exclude<SupportMessageAuthorType, "SYSTEM">;
}) {
  const [reply, setReply] = useState("");
  const messageScrollerRef = useRef<HTMLDivElement>(null);
  const canReply = request.status !== "CLOSED";
  const isConversation = variant === "conversation";
  const latestMessage = request.messages.at(-1) ?? null;
  const { hasNewMessages, handleScroll, scrollToBottom } = useChatAutoScroll({
    scrollerRef: messageScrollerRef,
    threadId: isConversation ? request.id : null,
    latestMessageId: latestMessage?.id ?? null,
    isOwnLatestMessage: latestMessage?.authorType === viewerAuthorType,
    isLoading: false,
  });

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = reply.trim();
    if (!body || isReplying || !canReply) return;
    await onReply(body);
    setReply("");
  }

  return (
    <section
      className={
        isConversation
          ? `flex ${CHAT_PANEL_HEIGHT} flex-col overflow-hidden bg-surface md:rounded-[28px] md:border md:border-black/[0.07]`
          : "overflow-hidden rounded-[24px] border border-black/[0.07] bg-surface"
      }
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-black/[0.06] p-5">
        {backHref ? (
          <Link
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-ink"
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">{request.reference}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
              {supportStatusLabels[request.status]}
            </span>
            {request.priority === "URGENT" ? (
              <span className="rounded-full bg-danger-tint px-2.5 py-1 text-xs font-semibold text-danger">Urgent</span>
            ) : null}
          </div>
          <h1 className="mt-3 truncate text-xl font-semibold">{request.subject}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {getSupportCategoryLabel(request.category)} · Started {formatSupportDate(request.createdAt)}
          </p>
        </div>
      </div>

      <div className={isConversation ? "relative min-h-0 flex-1" : "relative"}>
        {isConversation && hasNewMessages ? (
          <button
            className="absolute bottom-4 left-1/2 z-10 inline-flex h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 text-xs font-semibold text-white shadow-lg"
            type="button"
            onClick={() => scrollToBottom("smooth")}
          >
            <ArrowDown className="size-3.5" aria-hidden="true" />
            New messages
          </button>
        ) : null}
        <div
          ref={messageScrollerRef}
          onScroll={isConversation ? handleScroll : undefined}
          className={`grid gap-4 bg-surface-muted p-5 ${
            isConversation ? "h-full content-start overflow-y-auto" : ""
          }`}
        >
          {request.messages.map((message) => {
            const fromSupport = message.authorType === "ADMIN" || message.authorType === "SYSTEM";
            return (
              <article
                key={message.id}
                className={`max-w-[88%] rounded-[20px] p-4 ${
                  fromSupport
                    ? "justify-self-start border border-black/[0.06] bg-surface"
                    : "justify-self-end bg-ink text-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="text-sm">{message.authorName}</strong>
                  <span className={`text-xs ${fromSupport ? "text-ink-400" : "text-white/60"}`}>
                    {formatSupportDate(message.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
              </article>
            );
          })}
        </div>
      </div>

      {canReply ? (
        <form className="shrink-0 border-t border-black/[0.06] p-4" onSubmit={submitReply}>
          <label className="sr-only" htmlFor={`support-reply-${request.id}`}>Reply</label>
          <div className="flex items-end gap-2">
            <textarea
              id={`support-reply-${request.id}`}
              className="min-h-12 flex-1 resize-none rounded-[18px] border border-black/[0.1] px-4 py-3 text-sm outline-none transition focus:border-black/30"
              maxLength={4_000}
              placeholder="Write a reply"
              rows={2}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
            <button
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={!reply.trim() || isReplying}
              aria-label="Send reply"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </div>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        </form>
      ) : (
        <p className="shrink-0 border-t border-black/[0.06] p-4 text-center text-sm text-ink-500">
          This request is closed. Start a new request if you still need help.
        </p>
      )}
    </section>
  );
}
