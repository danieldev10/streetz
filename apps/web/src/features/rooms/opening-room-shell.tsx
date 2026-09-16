import { ArrowLeft, LoaderCircle } from "lucide-react";
import { CHAT_PANEL_HEIGHT } from "@/lib/chat-layout";

export function OpeningRoomShell({
  isAdmin,
  notice,
  socketStatus,
  onBack,
}: {
  isAdmin: boolean;
  notice: string | null;
  socketStatus: "connecting" | "connected" | "offline";
  onBack: () => void;
}) {
  return (
    <section className="px-0 md:px-8 md:py-8">
      <article className={`mx-auto flex ${CHAT_PANEL_HEIGHT} max-w-3xl flex-col overflow-hidden bg-surface md:rounded-[28px] md:border md:border-black/5 md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]`}>
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-ink"
            onClick={onBack}
            aria-label="Back to events"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="h-5 w-36 rounded-full bg-surface-shade" />
            <div className="mt-2 h-3 w-24 rounded-full bg-surface-sunken" />
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-2 text-xs font-medium text-ink-600">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-brand" : "bg-ink-200"}`} />
            {isAdmin ? "Moderator" : socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        </div>

        {notice ? <p className="mx-4 mt-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        <div className="grid min-h-0 flex-1 place-items-center bg-surface-muted px-4 py-5">
          <LoaderCircle className="size-7 animate-spin text-brand" aria-hidden="true" />
          <span className="sr-only">Loading event chat</span>
        </div>

        {isAdmin ? (
          <div className="shrink-0 border-t border-black/5 bg-surface p-4 text-center text-sm font-medium text-ink-600">
            Moderator view only
          </div>
        ) : (
          <div className="flex shrink-0 gap-3 border-t border-black/5 bg-surface p-4">
            <div className="h-12 min-w-0 flex-1 rounded-full border border-black/8 bg-surface-muted" />
            <div className="size-12 shrink-0 rounded-full bg-brand-tint" />
          </div>
        )}
      </article>
    </section>
  );
}
