"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { SupportRequest } from "@/lib/types";
import { SupportThread } from "./support-thread";

function MemberSupportConversation({
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
      `/support/requests/me/${encodeURIComponent(requestId)}`,
      {
        headers: authHeaders(token),
      },
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
    if (!request) return;
    setIsReplying(true);
    setReplyError(null);
    try {
      const result = await apiRequest<SupportRequest>(
        `/support/requests/me/${encodeURIComponent(request.id)}/messages`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ message }),
        },
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
    <section className="min-h-[calc(100vh-80px)] bg-[#f7f7f7] px-0 md:min-h-screen md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl">
        {isLoading ? (
          <div className="h-[calc(100dvh-168px)] animate-pulse bg-black/5 md:h-[720px] md:rounded-[24px]" />
        ) : null}

        {!isLoading && error ? (
          <section className="mx-5 rounded-[24px] border border-black/[0.07] bg-white p-7 text-center md:mx-0">
            <h1 className="text-xl font-semibold">This support request is unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-[#666666]">
              It may not belong to this account, or it may no longer be available.
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
              href="/support/requests"
            >
              Back to requests
            </Link>
          </section>
        ) : null}

        {!isLoading && request ? (
          <SupportThread
            request={request}
            isReplying={isReplying}
            error={replyError}
            onReply={reply}
            backHref="/support/requests"
            variant="conversation"
          />
        ) : null}
      </div>
    </section>
  );
}

export function MemberSupportRequestClient({
  requestId,
}: {
  requestId: string;
}) {
  return (
    <AuthenticatedRoute activeTab="support">
      {({ token }) => (
        <MemberSupportConversation
          key={requestId}
          requestId={requestId}
          token={token}
        />
      )}
    </AuthenticatedRoute>
  );
}
