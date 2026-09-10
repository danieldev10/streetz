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
import { ListSkeleton } from "@/components/skeletons";
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
      <h1 className="sr-only">{isAdmin ? "Rooms administration" : "Rooms"}</h1>
      <div className="px-5 pt-6 md:px-8 md:pt-8">
        <div className={`mb-4 items-center justify-end gap-2 ${isAdmin ? "flex" : "hidden md:flex"}`}>
          {!isGuest ? (
            <div className="hidden items-center gap-2 rounded-full border border-black/8 px-4 py-2 text-sm font-medium md:inline-flex">
              <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-brand" : "bg-ink-200"}`} />
              {socketStatus === "connected" ? "Live" : "Connecting"}
            </div>
          ) : null}
          {isAdmin ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white"
              type="button"
              onClick={onStartCreateRoom}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Create Room
            </button>
          ) : null}
        </div>

        {!isGuest ? (
          <div className="mb-4 grid grid-cols-2 rounded-full border border-black/5 bg-surface-muted p-1 text-sm font-medium md:max-w-sm">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "active" ? "bg-ink text-white" : "text-ink-600"}`}
                  onClick={() => onViewModeChange("active")}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "inactive" ? "bg-ink text-white" : "text-ink-600"}`}
                  onClick={() => onViewModeChange("inactive")}
                >
                  Inactive
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "joined" ? "bg-ink text-white" : "text-ink-600"}`}
                  onClick={() => onViewModeChange("joined")}
                >
                  Joined
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 ${viewMode === "explore" ? "bg-ink text-white" : "text-ink-600"}`}
                  onClick={() => onViewModeChange("explore")}
                >
                  Explore
                </button>
              </>
            )}
          </div>
        ) : null}

        {notice ? <p className="mb-4 rounded-2xl bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {isLoadingRooms ? (
          <ListSkeleton label="Loading rooms" hasAvatar={false} />
        ) : visibleRooms.length > 0 ? (
          <div className="grid gap-3">
            {visibleRooms.map((room) => (
              <article
                key={room.id}
                className={`rounded-3xl border p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)] ${
                  room.isActive ? "border-black/5 bg-surface" : "border-black/[0.03] bg-surface-muted opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{room.name}</h2>
                      <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-strong">
                        {room.category}
                      </span>
                      {isAdmin ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            room.isActive ? "bg-brand-tint text-brand-strong" : "bg-surface-muted text-ink-500"
                          }`}
                        >
                          {room.isActive ? "Active" : "Inactive"}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-600">{room.description || "Open member conversation."}</p>
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
                              ? "border-danger-border text-danger hover:bg-danger-tint"
                              : "border-brand text-brand-strong hover:bg-brand-tint"
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
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-ink-600">
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1">
                    <Users className="size-3.5" aria-hidden="true" />
                    {room.memberCount} members
                  </span>
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1">
                      <MessageCircle className="size-3.5" aria-hidden="true" />
                      {room.messageCount ?? 0} messages
                    </span>
                  ) : null}
                  {!isAdmin && room.hasJoined && (room.unreadCount ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-strong px-3 py-1 font-semibold text-white">
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
              <MessageCircle className="mx-auto size-8 text-brand" aria-hidden="true" />
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
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-600">
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
          <section className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Join this room?</h2>
                <p className="mt-2 text-sm leading-6 text-ink-600">{pendingJoinRoom.name}</p>
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
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
          <section className="w-full max-w-sm rounded-[28px] bg-surface p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">
                  {pendingToggleRoom.isActive ? "Deactivate room?" : "Activate room?"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  {pendingToggleRoom.isActive
                    ? `"${pendingToggleRoom.name}" will be hidden from members and no new messages can be sent.`
                    : `"${pendingToggleRoom.name}" will become visible to members again.`}
                </p>
              </div>
              <button
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/8 text-ink"
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
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onCloseToggle}
                disabled={isTogglingRoom}
              >
                Cancel
              </button>
              <button
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                  pendingToggleRoom.isActive ? "bg-danger text-white" : "bg-ink text-white"
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
