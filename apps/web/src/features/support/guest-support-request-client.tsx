"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { apiRequest, getUserErrorMessage } from "@/lib/api";
import type { SupportRequest } from "@/lib/types";
import { SupportThread } from "./support-thread";

export function GuestSupportRequestClient({
  requestId,
  token,
}: {
  requestId: string;
  token: string;
}) {
  const [request, setRequest] = useState<SupportRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReplying, setIsReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiRequest<SupportRequest>(
      `/support/requests/${encodeURIComponent(requestId)}/manage?token=${encodeURIComponent(token)}`
    )
      .then((result) => {
        if (!cancelled) setRequest(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getUserErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId, token]);

  async function reply(message: string) {
    setIsReplying(true);
    setReplyError(null);
    try {
      const result = await apiRequest<SupportRequest>(
        `/support/requests/${encodeURIComponent(requestId)}/manage/messages?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          body: JSON.stringify({ message })
        }
      );
      setRequest(result);
    } catch (replyFailure) {
      setReplyError(getUserErrorMessage(replyFailure));
      throw replyFailure;
    } finally {
      setIsReplying(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#0d0d0d]">
      <header className="border-b border-black/[0.06] bg-white">
        <div className="mx-auto flex h-20 w-full max-w-3xl items-center justify-between px-5">
          <Link className="inline-flex items-center gap-2 text-sm font-medium" href="/support">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Support
          </Link>
          <BrandLogo size="header" priority />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666]">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            Private
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="mb-5 rounded-[20px] border border-black/[0.06] bg-white p-4 text-sm leading-6 text-[#666666]">
          This private link provides access to your support conversation. Do not share it with anyone.
        </div>

        {isLoading ? <div className="h-96 animate-pulse rounded-[24px] bg-black/5" /> : null}
        {!isLoading && error ? (
          <section className="rounded-[24px] border border-black/[0.07] bg-white p-7 text-center">
            <h1 className="text-xl font-semibold">This support link is unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-[#666666]">
              The link may have expired or been replaced by a newer email. Open the latest support email, or start a new request.
            </p>
            <Link className="mt-5 inline-flex h-11 items-center rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white" href="/support">
              Go to support
            </Link>
          </section>
        ) : null}
        {!isLoading && request ? (
          <SupportThread
            request={request}
            isReplying={isReplying}
            error={replyError}
            onReply={reply}
          />
        ) : null}
      </div>
    </main>
  );
}
