import { ArrowLeft, ArrowRight, Users } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { formatConnectionStatus } from "@/lib/profile";
import type { ChatRoom, RoomMember } from "@/lib/types";

export function RoomMembersView({
  room,
  members,
  isLoading,
  notice,
  onBack,
  onOpenMember,
}: {
  room: ChatRoom;
  members: RoomMember[];
  isLoading: boolean;
  notice: string | null;
  onBack: () => void;
  onOpenMember: (member: RoomMember) => void;
}) {
  return (
    <section className="px-0 md:px-8 md:py-8">
      <article className="mx-auto flex h-[calc(100dvh-168px)] max-w-3xl flex-col overflow-hidden bg-white md:h-180 md:rounded-[28px] md:border md:border-black/5 md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
            onClick={onBack}
            aria-label="Back to room chat"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{room.name}</h1>
            <p className="truncate text-sm text-[#666666]">
              {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
            </p>
          </div>
        </div>

        {notice ? <p className="mx-4 mt-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] px-4 py-5">
          {isLoading ? (
            <LoadingState label="Loading room members" className="h-full min-h-90 rounded-[28px] border border-black/5 bg-white" />
          ) : members.length > 0 ? (
            <div className="grid gap-3">
              {members.map((member) => {
                const location = [member.city, member.state].filter(Boolean).join(", ") || "Nigeria";

                return (
                  <button
                    key={member.id}
                    type="button"
                    className="flex items-center gap-3 rounded-[24px] border border-black/5 bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/40"
                    onClick={() => onOpenMember(member)}
                    aria-label={`View ${member.displayName} profile`}
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-[#f6e0f6]">
                      <CandidatePhoto candidate={member} variant="thumb" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0d0d0d]">{member.displayName}</p>
                      <p className="truncate text-xs font-medium text-[#666666]">
                        {formatConnectionStatus(member.connectionStatus)} · {location}
                      </p>
                    </div>

                    <ArrowRight className="size-4 shrink-0 text-[#888888]" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid h-full min-h-90 place-items-center text-center">
              <div>
                <Users className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
                <h2 className="mt-3 text-2xl font-semibold">No members yet</h2>
                <p className="mt-2 text-sm text-[#666666]">Members will appear here after they join.</p>
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
