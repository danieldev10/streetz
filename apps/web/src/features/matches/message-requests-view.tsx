import { ActionButton } from "@/components/action-button";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { ListSkeleton } from "@/components/skeletons";
import type { MatchThread } from "@/lib/types";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";

export type MessageRequestView = "received" | "sent";

export function MessageRequestsView({
  view,
  requests,
  isLoading,
  notice,
  respondingRequestId,
  onAccept,
  onDecline,
}: {
  view: MessageRequestView;
  requests: MatchThread[];
  isLoading: boolean;
  notice: string | null;
  respondingRequestId: string | null;
  onAccept: (request: MatchThread) => void | Promise<void>;
  onDecline: (request: MatchThread) => void | Promise<void>;
}) {
  const isReceived = view === "received";
  const title = isReceived ? "Requests" : "Pending requests";

  return (
    <section className="px-5 pb-6 pt-6 md:px-8 md:pt-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <Link
            href="/messages"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-ink transition hover:bg-surface-muted"
            aria-label="Back to messages"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <h1 className="min-w-0 flex-1 text-lg font-semibold">{title}</h1>
          {!isLoading ? (
            <span className="grid min-w-6 shrink-0 place-items-center rounded-full bg-brand-strong px-1.5 text-xs font-semibold leading-6 text-white">
              {requests.length}
            </span>
          ) : null}
        </div>

        {notice ? <p className="mt-4 rounded-[16px] bg-brand-tint p-3 text-sm font-medium text-brand-deep" role="status">{notice}</p> : null}

        {isLoading ? (
          <ListSkeleton label={`Loading ${title.toLowerCase()}`} className="mt-5 grid gap-3" hasAction={isReceived} />
        ) : requests.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-[24px] border border-black/[0.05] bg-surface">
            {requests.map((request) => {
              const preview = request.lastMessage?.body || (request.lastMessage?.gifUrl ? "GIF" : "Message request");
              const isResponding = respondingRequestId === request.id;

              return (
                <article key={request.id} className="flex items-center gap-3 border-b border-black/[0.05] p-3 last:border-b-0 sm:p-4">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-brand-tint">
                    <CandidatePhoto candidate={request.user} variant="thumb" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{request.user.displayName}</p>
                    {isReceived ? (
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm text-ink-600" title={preview}>{preview}</p>
                        <div className="flex shrink-0 items-center gap-1.5" aria-busy={isResponding}>
                          <ActionButton
                            spinnerClassName="size-3"
                            type="button"
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-full bg-ink px-2.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={respondingRequestId !== null}
                            onClick={() => onAccept(request)}
                            aria-label={`Accept request from ${request.user.displayName}`}
                          >
                            Accept
                          </ActionButton>
                          <ActionButton
                            spinnerClassName="size-3"
                            type="button"
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-black/[0.08] px-2.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={respondingRequestId !== null}
                            onClick={() => onDecline(request)}
                            aria-label={`Decline request from ${request.user.displayName}`}
                          >
                            Decline
                          </ActionButton>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 truncate text-sm text-ink-500">Request sent · waiting for a response</p>
                    )}
                    {isResponding ? (
                      <span className="sr-only" role="status">Updating request</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 grid min-h-52 place-items-center rounded-[24px] border border-black/[0.05] p-6 text-center">
            <div>
              <MessageCircle className="mx-auto size-7 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">{isReceived ? "No requests" : "No pending requests"}</h2>
              <p className="mt-2 text-sm text-ink-600">
                {isReceived ? "New message requests will appear here." : "Requests waiting for a response will appear here."}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
