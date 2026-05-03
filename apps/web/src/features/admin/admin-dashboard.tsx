"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { LoaderCircle, MessageCircle, Pencil, Plus, Power, RefreshCw, Save } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { apiRequest, authHeaders } from "@/lib/api";
import type { ChatRoom } from "@/lib/types";

type RoomForm = {
  name: string;
  city: string;
  category: string;
  description: string;
  isActive: boolean;
};

const emptyRoomForm: RoomForm = {
  name: "",
  city: "",
  category: "",
  description: "",
  isActive: true,
};

function getRoomForm(room: ChatRoom): RoomForm {
  return {
    name: room.name,
    city: room.city,
    category: room.category,
    description: room.description ?? "",
    isActive: room.isActive,
  };
}

export function AdminDashboard({ token }: { token: string }) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState<RoomForm>(emptyRoomForm);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const editingRoom = rooms.find((room) => room.id === editingRoomId) ?? null;

  async function loadRooms(options: { clearNotice?: boolean; showLoading?: boolean } = {}) {
    const { clearNotice = true, showLoading = true } = options;

    if (showLoading) {
      setIsLoadingRooms(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const response = await apiRequest<{ rooms: ChatRoom[] }>("/admin/rooms", {
        headers: authHeaders(token),
      });
      setRooms(response.rooms);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load rooms.");
    } finally {
      if (showLoading) {
        setIsLoadingRooms(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRooms();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function startCreateRoom() {
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
    setNotice(null);
  }

  function startEditRoom(room: ChatRoom) {
    setEditingRoomId(room.id);
    setRoomForm(getRoomForm(room));
    setNotice(null);
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingRoom(true);
    setNotice(null);

    const payload = {
      name: roomForm.name,
      city: roomForm.city,
      category: roomForm.category,
      description: roomForm.description,
      isActive: roomForm.isActive,
    };

    try {
      const savedRoom = await apiRequest<ChatRoom>(
        editingRoomId ? `/admin/rooms/${editingRoomId}` : "/admin/rooms",
        {
          method: editingRoomId ? "PUT" : "POST",
          headers: authHeaders(token),
          body: JSON.stringify(payload),
        }
      );

      setRooms((current) => {
        if (editingRoomId) {
          return current.map((room) => (room.id === savedRoom.id ? savedRoom : room));
        }

        return [savedRoom, ...current];
      });
      setEditingRoomId(savedRoom.id);
      setRoomForm(getRoomForm(savedRoom));
      setNotice(editingRoomId ? "Room updated." : "Room created.");
      void loadRooms({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save room.");
    } finally {
      setIsSavingRoom(false);
    }
  }

  async function toggleRoom(room: ChatRoom) {
    setNotice(null);

    try {
      const updatedRoom = await apiRequest<ChatRoom>(`/admin/rooms/${room.id}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ isActive: !room.isActive }),
      });
      setRooms((current) => current.map((item) => (item.id === updatedRoom.id ? updatedRoom : item)));

      if (editingRoomId === room.id) {
        setRoomForm(getRoomForm(updatedRoom));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update room.");
    }
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Admin"
        title="Manage Streetz rooms."
        action={
          <button
            className="hidden h-10 items-center gap-2 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white md:inline-flex"
            type="button"
            onClick={startCreateRoom}
          >
            <Plus className="size-4" aria-hidden="true" />
            Room
          </button>
        }
      />

      <div className="grid gap-5 px-5 pb-24 md:grid-cols-[minmax(320px,420px)_1fr] md:px-8 md:pb-8">
        <form
          onSubmit={saveRoom}
          className="self-start rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{editingRoom ? "Edit room" : "Create room"}</h2>
              <p className="mt-1 text-sm text-[#666666]">Admin-created spaces for member conversations</p>
            </div>
            <button
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08]"
              type="button"
              onClick={startCreateRoom}
              aria-label="Create new room"
              title="New room"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              placeholder="Room name"
              value={roomForm.name}
              onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="City"
                value={roomForm.city}
                onChange={(event) => setRoomForm((current) => ({ ...current, city: event.target.value }))}
                required
              />
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Category"
                value={roomForm.category}
                onChange={(event) => setRoomForm((current) => ({ ...current, category: event.target.value }))}
                required
              />
            </div>
            <textarea
              className="min-h-24 rounded-[18px] border border-black/[0.08] p-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              placeholder="Description"
              value={roomForm.description}
              onChange={(event) => setRoomForm((current) => ({ ...current, description: event.target.value }))}
              maxLength={280}
            />
            <label className="flex items-center justify-between gap-3 rounded-[18px] bg-[#fafafa] px-4 py-3 text-sm font-medium">
              Active room
              <input
                type="checkbox"
                checked={roomForm.isActive}
                onChange={(event) => setRoomForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
            </label>
          </div>

          {notice ? <p className="mt-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          <button
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSavingRoom}
          >
            {isSavingRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {editingRoom ? "Save room" : "Create room"}
          </button>
        </form>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Rooms</h2>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-full border border-black/[0.08] px-4 text-sm font-medium"
              type="button"
              onClick={() => loadRooms()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </button>
          </div>

          {isLoadingRooms ? (
            <div className="grid min-h-[360px] place-items-center rounded-[24px] border border-black/[0.05]">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-[#666666]">Loading rooms</p>
              </div>
            </div>
          ) : rooms.length > 0 ? (
            <div className="grid gap-3">
              {rooms.map((room) => (
                <article
                  key={room.id}
                  className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{room.name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${room.isActive ? "bg-[#d4fae8] text-[#0fa76e]" : "bg-[#fafafa] text-[#777777]"}`}>
                          {room.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#666666]">{room.description || "No description yet."}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">{room.city}</span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">{room.category}</span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">{room.memberCount} members</span>
                        <span className="rounded-full bg-[#fafafa] px-3 py-1">{room.messageCount} messages</span>
                      </div>
                    </div>
                    <div className="grid shrink-0 gap-2">
                      <button
                        className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08]"
                        type="button"
                        onClick={() => startEditRoom(room)}
                        aria-label={`Edit ${room.name}`}
                        title="Edit"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08]"
                        type="button"
                        onClick={() => toggleRoom(room)}
                        aria-label={room.isActive ? `Deactivate ${room.name}` : `Activate ${room.name}`}
                        title={room.isActive ? "Deactivate" : "Activate"}
                      >
                        <Power className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[360px] place-items-center rounded-[24px] border border-black/[0.05] p-6 text-center">
              <div>
                <MessageCircle className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                <h2 className="mt-3 text-2xl font-semibold">No rooms yet</h2>
                <p className="mt-2 text-sm text-[#666666]">Create the first member room to unlock this section.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
