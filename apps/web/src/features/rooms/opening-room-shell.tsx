import { ArrowLeft, LoaderCircle } from "lucide-react";

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
      <article className="mx-auto flex h-[calc(100dvh-168px)] max-w-3xl flex-col overflow-hidden bg-white md:h-180 md:rounded-[28px] md:border md:border-black/5 md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
            onClick={onBack}
            aria-label="Back to rooms"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="h-5 w-36 rounded-full bg-[#f0f0f0]" />
            <div className="mt-2 h-3 w-24 rounded-full bg-[#f6f6f6]" />
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#666666]">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#bd40be]" : "bg-[#c6c6c6]"}`} />
            {isAdmin ? "Moderator" : socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        </div>

        {notice ? <p className="mx-4 mt-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

        <div className="grid min-h-0 flex-1 place-items-center bg-[#fafafa] px-4 py-5">
          <LoaderCircle className="size-7 animate-spin text-[#bd40be]" aria-hidden="true" />
          <span className="sr-only">Loading room</span>
        </div>

        {isAdmin ? (
          <div className="shrink-0 border-t border-black/5 bg-white p-4 text-center text-sm font-medium text-[#666666]">
            Moderator view only
          </div>
        ) : (
          <div className="flex shrink-0 gap-3 border-t border-black/5 bg-white p-4">
            <div className="h-12 min-w-0 flex-1 rounded-full border border-black/8 bg-[#fafafa]" />
            <div className="size-12 shrink-0 rounded-full bg-[#f6e0f6]" />
          </div>
        )}
      </article>
    </section>
  );
}
