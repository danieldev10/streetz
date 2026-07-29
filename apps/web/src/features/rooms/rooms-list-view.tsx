import {
  ArrowRight,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import type { ChatRoom } from "@/lib/types";
import type { RoomViewMode } from "./room-model";

export function RoomsListView({
  isGuest,
  isAdmin,
  socketStatus,
  viewMode,
  visibleRooms,
  notice,
  isLoadingRooms,
  openingRoomId,
  pendingJoinRoom,
  isJoiningRoom,
  pendingToggleRoom,
  isTogglingRoom,
  onStartCreateRoom,
  onViewModeChange,
  onStartEditRoom,
  onOpenRoom,
  onRefresh,
  onCloseJoin,
  onConfirmJoin,
  onRequestToggle,
  onCloseToggle,
  onConfirmToggle,
}: {
  isGuest: boolean;
  isAdmin: boolean;
  socketStatus: "connecting" | "connected" | "offline";
  viewMode: RoomViewMode;
  visibleRooms: ChatRoom[];
  notice: string | null;
  isLoadingRooms: boolean;
  openingRoomId: string | null;
  pendingJoinRoom: ChatRoom | null;
  isJoiningRoom: boolean;
  pendingToggleRoom: ChatRoom | null;
  isTogglingRoom: boolean;
  onStartCreateRoom: () => void;
  onViewModeChange: (mode: RoomViewMode) => void;
  onStartEditRoom: (room: ChatRoom) => void;
  onOpenRoom: (room: ChatRoom) => void;
  onRefresh: () => void;
  onCloseJoin: () => void;
  onConfirmJoin: () => void;
  onRequestToggle: (room: ChatRoom) => void;
  onCloseToggle: () => void;
  onConfirmToggle: (room: ChatRoom) => void;
}) {
  return (
    <section>
      <ScreenHeader
        eyebrow="Rooms"
        title=""
        action={
          <div className="flex items-center gap-2">
            {!isGuest ? (
              <div className="hidden items-center gap-2 rounded-full border border-black/8 px-4 py-2 text-sm font-medium md:inline-flex">
                <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#bd40be]" : "bg-[#c6c6c6]"}`} />
                {socketStatus === "connected" ? "Live" : "Connecting"}
              </div>
            ) : null}
            {isAdmin ? (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white"
                type="button"
                onClick={onStartCreateRoom}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Create Room
              </button>
            ) : null}
          </div>
        }
      />

      <div className="px-5 md:px-8">
        {!isGuest ? (
          <div className="mb-4 grid grid-cols-2 rounded-full border border-black/5 bg-[#fafafa] p-1 text-sm font-medium md:max-w-sm">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "active" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
                  onClick={() => onViewModeChange("active")}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "inactive" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
                  onClick={() => onViewModeChange("inactive")}
                >
                  Inactive
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "joined" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
                  onClick={() => onViewModeChange("joined")}
                >
                  Joined
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "explore" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
                  onClick={() => onViewModeChange("explore")}
                >
                  Explore
                </button>
              </>
            )}
          </div>
        ) : null}

        {notice ? <p className="mb-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

        {isLoadingRooms ? (
          <LoadingState label="Loading rooms" className="min-h-105 rounded-[28px] border border-black/5" />
        ) : visibleRooms.length > 0 ? (
          <div className="grid gap-3">
            {visibleRooms.map((room) => (
              <article
                key={room.id}
                className={`rounded-3xl border p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${
                  room.isActive ? "border-black/5 bg-white" : "border-black/[0.03] bg-[#fafafa] opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{room.name}</h2>
                      <span className="rounded-full bg-[#f6e0f6] px-2.5 py-1 text-xs font-medium text-[#9d2a9e]">
                        {room.category}
                      </span>
                      {isAdmin ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            room.isActive ? "bg-[#f6e0f6] text-[#9d2a9e]" : "bg-[#fafafa] text-[#777777]"
                          }`}
                        >
                          {room.isActive ? "Active" : "Inactive"}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-[#666666]">{room.description || "Open member conversation."}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isAdmin ? (
                      <>
                        <button
                          className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
                          type="button"
                          onClick={() => onStartEditRoom(room)}
                          aria-label={`Edit ${room.name}`}
                          title="Edit"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          className={`inline-flex size-10 items-center justify-center rounded-full border ${
                            room.isActive
                              ? "border-red-200 text-red-500 hover:bg-red-50"
                              : "border-[#bd40be] text-[#9d2a9e] hover:bg-[#f6e0f6]"
                          }`}
                          type="button"
                          onClick={() => onRequestToggle(room)}
                          aria-label={room.isActive ? `Deactivate ${room.name}` : `Activate ${room.name}`}
                          title={room.isActive ? "Deactivate" : "Activate"}
                        >
                          <Power className="size-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : null}
                    <button
                      className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
                      type="button"
                      onClick={() => onOpenRoom(room)}
                      disabled={openingRoomId !== null}
                      aria-label={`${room.hasJoined || isAdmin ? "Enter" : "Join"} ${room.name}`}
                      title={room.hasJoined || isAdmin ? "Enter room" : "Join room"}
                    >
                      {openingRoomId === room.id ? (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ArrowRight className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1">
                    <Users className="size-3.5" aria-hidden="true" />
                    {room.memberCount} members
                  </span>
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1">
                      <MessageCircle className="size-3.5" aria-hidden="true" />
                      {room.messageCount ?? 0} messages
                    </span>
                  ) : null}
                  {!isAdmin && room.hasJoined && (room.unreadCount ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#9d2a9e] px-3 py-1 font-semibold text-white">
                      {(room.unreadCount ?? 0) > 9 ? "9+" : room.unreadCount} new
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-105 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
            <div>
              <MessageCircle className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">
                {isAdmin
                  ? viewMode === "inactive"
                    ? "No inactive rooms"
                    : "No active rooms"
                  : isGuest
                    ? "No rooms yet"
                    : viewMode === "joined"
                      ? "No joined rooms yet"
                      : "No rooms yet"}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">
                {isAdmin
                  ? viewMode === "inactive"
                    ? "Deactivated rooms will appear here."
                    : "Create a room to get started."
                  : isGuest
                    ? "Active rooms will appear here once they are available."
                    : viewMode === "joined"
                      ? "Rooms you join from Explore will appear here."
                      : "Admin-created rooms will appear here once they are active."}
              </p>
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/8 px-5 text-sm font-medium"
                onClick={onRefresh}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {pendingJoinRoom ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5">
          <section className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Join this room?</h2>
                <p className="mt-2 text-sm leading-6 text-[#666666]">{pendingJoinRoom.name}</p>
              </div>
              <button
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8"
                type="button"
                onClick={onCloseJoin}
                aria-label="Close"
                title="Close"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-5 text-sm font-medium"
                type="button"
                onClick={onCloseJoin}
              >
                No
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onConfirmJoin}
                disabled={isJoiningRoom}
              >
                {isJoiningRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Yes
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingToggleRoom ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0d0d0d]">
                  {pendingToggleRoom.isActive ? "Deactivate room?" : "Activate room?"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#666666]">
                  {pendingToggleRoom.isActive
                    ? `"${pendingToggleRoom.name}" will be hidden from members and no new messages can be sent.`
                    : `"${pendingToggleRoom.name}" will become visible to members again.`}
                </p>
              </div>
              <button
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
                type="button"
                onClick={onCloseToggle}
                disabled={isTogglingRoom}
                aria-label="Close confirmation"
                title="Close"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onCloseToggle}
                disabled={isTogglingRoom}
              >
                Cancel
              </button>
              <button
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                  pendingToggleRoom.isActive ? "bg-red-600 text-white" : "bg-[#0d0d0d] text-white"
                }`}
                type="button"
                onClick={() => onConfirmToggle(pendingToggleRoom)}
                disabled={isTogglingRoom}
              >
                {isTogglingRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                {pendingToggleRoom.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
