"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import type { SupportRequest } from "@/lib/types";
import { getSupportCategoryLabel, supportStatusLabels } from "./support-content";

function formatSupportDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos"
  }).format(new Date(value));
}

function statusClass(status: SupportRequest["status"]) {
  if (status === "RESOLVED") return "bg-emerald-50 text-emerald-700";
  if (status === "CLOSED") return "bg-black/5 text-[#666666]";
  if (status === "WAITING_ON_USER") return "bg-amber-50 text-amber-800";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700";
  return "bg-violet-50 text-violet-700";
}

export function SupportThread({
  request,
  isReplying,
  error,
  onReply,
}: {
  request: SupportRequest;
  isReplying: boolean;
  error?: string | null;
  onReply: (message: string) => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const canReply = request.status !== "CLOSED";

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = reply.trim();
    if (!body || isReplying || !canReply) return;
    await onReply(body);
    setReply("");
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-black/[0.07] bg-white">
      <div className="border-b border-black/[0.06] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#777777]">{request.reference}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
            {supportStatusLabels[request.status]}
          </span>
          {request.priority === "URGENT" ? (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Urgent</span>
          ) : null}
        </div>
        <h2 className="mt-3 text-xl font-semibold">{request.subject}</h2>
        <p className="mt-1 text-sm text-[#777777]">
          {getSupportCategoryLabel(request.category)} · Started {formatSupportDate(request.createdAt)}
        </p>
      </div>

      <div className="grid gap-4 bg-[#fafafa] p-5">
        {request.messages.map((message) => {
          const fromSupport = message.authorType === "ADMIN" || message.authorType === "SYSTEM";
          return (
            <article
              key={message.id}
              className={`max-w-[88%] rounded-[20px] p-4 ${
                fromSupport
                  ? "justify-self-start border border-black/[0.06] bg-white"
                  : "justify-self-end bg-[#0d0d0d] text-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <strong className="text-sm">{message.authorName}</strong>
                <span className={`text-xs ${fromSupport ? "text-[#888888]" : "text-white/60"}`}>
                  {formatSupportDate(message.createdAt)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
            </article>
          );
        })}
      </div>

      {canReply ? (
        <form className="border-t border-black/[0.06] p-4" onSubmit={submitReply}>
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
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[#0d0d0d] text-white disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={!reply.trim() || isReplying}
              aria-label="Send reply"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </form>
      ) : (
        <p className="border-t border-black/[0.06] p-4 text-center text-sm text-[#777777]">
          This request is closed. Start a new request if you still need help.
        </p>
      )}
    </section>
  );
}
