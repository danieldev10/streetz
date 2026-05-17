"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  SendHorizontal,
  Users,
  X,
} from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { SOCKET_URL, apiRequest, authHeaders } from "@/lib/api";
import { buildDatedMessageItems } from "@/lib/chat-dates";
import type { ChatRoom, RoomMessage, StreetzUser } from "@/lib/types";

type RoomViewMode = "explore" | "joined";
type AdminRoomView = "list" | "form";
type AdminRoomMode = "list" | "create" | "edit";

type RoomForm = {
  name: string;
  category: string;
  description: string;
  isActive: boolean;
};

const emptyRoomForm: RoomForm = {
  name: "",
  category: "",
  description: "",
  isActive: true,
};

function getRoomActivityTime(room: ChatRoom) {
  return Date.parse(room.updatedAt) || Date.parse(room.createdAt) || 0;
}

function getRoomMessageTime(message: RoomMessage) {
  return Date.parse(message.createdAt) || 0;
}

function getRoomForm(room: ChatRoom): RoomForm {
  return {
    name: room.name,
    category: room.category,
    description: room.description ?? "",
    isActive: room.isActive,
  };
}

function OpeningRoomShell({
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
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
            {isAdmin ? "Moderator" : socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        </div>

        {notice ? <p className="mx-4 mt-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        <div className="grid min-h-0 flex-1 place-items-center bg-[#fafafa] px-4 py-5">
          <LoaderCircle className="size-7 animate-spin text-[#18E299]" aria-hidden="true" />
          <span className="sr-only">Loading room</span>
        </div>

        {isAdmin ? (
          <div className="shrink-0 border-t border-black/5 bg-white p-4 text-center text-sm font-medium text-[#666666]">
            Moderator view only
          </div>
        ) : (
          <div className="flex shrink-0 gap-3 border-t border-black/5 bg-white p-4">
            <div className="h-12 min-w-0 flex-1 rounded-full border border-black/8 bg-[#fafafa]" />
            <div className="size-12 shrink-0 rounded-full bg-[#d4fae8]" />
          </div>
        )}
      </article>
    </section>
  );
}

export function RoomsTab({
  token,
  user,
  initialRooms = [],
  initialSelectedRoomId = null,
  adminMode = "list",
  adminRoomId = null,
  onRoomsLoaded,
  onRoomOpened,
  onNotificationsChanged,
}: {
  token: string;
  user: StreetzUser;
  initialRooms?: ChatRoom[];
  initialSelectedRoomId?: string | null;
  adminMode?: AdminRoomMode;
  adminRoomId?: string | null;
  onRoomsLoaded: (rooms: ChatRoom[]) => void;
  onRoomOpened: (room: ChatRoom) => void;
  onNotificationsChanged: () => void;
}) {
  const router = useRouter();
  const isAdmin = user.role === "ADMIN";
  const [rooms, setRooms] = useState<ChatRoom[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialSelectedRoomId);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<ChatRoom | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [viewMode, setViewMode] = useState<RoomViewMode>("joined");
  const [adminRoomView, setAdminRoomView] = useState<AdminRoomView>(adminMode === "list" ? "list" : "form");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(adminMode === "edit" ? adminRoomId : null);
  const [roomForm, setRoomForm] = useState<RoomForm>(emptyRoomForm);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(initialRooms.length === 0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedRoomIdRef = useRef<string | null>(selectedRoomId);
  const roomMessageIdsRef = useRef<Set<string>>(new Set());
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const onRoomsLoadedRef = useRef(onRoomsLoaded);
  const onNotificationsChangedRef = useRef(onNotificationsChanged);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );
  const displayedMessages = useMemo(
    () => [...messages].sort((first, second) => getRoomMessageTime(first) - getRoomMessageTime(second)),
    [messages]
  );
  const datedMessages = useMemo(() => buildDatedMessageItems(displayedMessages), [displayedMessages]);
  const latestDisplayedMessageId = displayedMessages[displayedMessages.length - 1]?.id ?? null;
  const orderedRooms = useMemo(
    () => [...rooms].sort((first, second) => getRoomActivityTime(second) - getRoomActivityTime(first)),
    [rooms]
  );
  const joinedRooms = orderedRooms.filter((room) => room.hasJoined);
  const exploreRooms = isAdmin ? orderedRooms : orderedRooms.filter((room) => !room.hasJoined);
  const visibleRooms = viewMode === "joined" && !isAdmin ? joinedRooms : exploreRooms;

  async function loadRooms(options: { clearNotice?: boolean; showLoading?: boolean } = {}) {
    const { clearNotice = true, showLoading = true } = options;

    if (showLoading && rooms.length === 0) {
      setIsLoadingRooms(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const response = await apiRequest<{ rooms: ChatRoom[] }>(isAdmin ? "/admin/rooms" : "/rooms", {
        headers: authHeaders(token),
      });
      setRooms(response.rooms);
      setSelectedRoomId((current) => {
        if (current && response.rooms.some((room) => room.id === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load rooms.");
    } finally {
      if (showLoading) {
        setIsLoadingRooms(false);
      }
    }
  }

  async function loadMessages(roomId: string) {
    setIsLoadingMessages(true);
    setNotice(null);

    try {
      const response = await apiRequest<{ messages: RoomMessage[] }>(`/rooms/${roomId}/messages`, {
        headers: authHeaders(token),
      });
      setMessages(response.messages);
      roomMessageIdsRef.current = new Set(response.messages.map((message) => message.id));
      clearRoomUnread(roomId);
      onNotificationsChangedRef.current();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load room messages.");
    } finally {
      setIsLoadingMessages(false);
    }
  }

  function openJoinedRoom(room: ChatRoom) {
    setSelectedRoomId(room.id);
    setMessages([]);
    roomMessageIdsRef.current = new Set();
    setMessageBody("");
    setNotice(null);
    router.push(`/rooms/${room.id}`);

    if (!isAdmin) {
      onRoomOpened(room);
      clearRoomUnread(room.id);
      void markRoomRead(room.id);
    }
  }

  function requestJoinRoom(room: ChatRoom) {
    if (isAdmin) {
      openJoinedRoom(room);
      return;
    }

    setPendingJoinRoom(room);
    setNotice(null);
  }

  function closeRoom() {
    if (selectedRoomId) {
      socketRef.current?.emit("room:leave", { roomId: selectedRoomId });
    }

    router.push("/rooms");
    setIsLeaveConfirmOpen(false);
    setSelectedRoomId(null);
    setMessages([]);
    roomMessageIdsRef.current = new Set();
    setMessageBody("");
    setNotice(null);
  }

  function upsertMessage(message: RoomMessage, options: { appendToMessages?: boolean } = {}) {
    const { appendToMessages = true } = options;

    if (appendToMessages) {
      if (roomMessageIdsRef.current.has(message.id)) {
        return;
      }

      roomMessageIdsRef.current.add(message.id);
      setMessages((current) => [...current, message]);
    }

    setRooms((current) => {
      const nextRooms = current.map((room) => {
        if (room.id !== message.roomId) {
          return room;
        }

        const isSelected = room.id === selectedRoomIdRef.current;
        const isMine = message.authorId === user.id;

        return {
          ...room,
          messageCount: room.messageCount === undefined ? undefined : room.messageCount + 1,
          unreadCount: isSelected || isMine ? 0 : (room.unreadCount ?? 0) + 1,
          updatedAt: message.createdAt,
        };
      });

      return nextRooms;
    });
  }

  function clearRoomUnread(roomId: string) {
    setRooms((current) => {
      const nextRooms = current.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room));

      return nextRooms;
    });
  }

  async function markRoomRead(roomId: string) {
    try {
      await apiRequest(`/rooms/${roomId}/read`, {
        method: "POST",
        headers: authHeaders(token),
      });
      onNotificationsChangedRef.current();
    } catch {
      // The periodic notification refresh will reconcile read state.
    }
  }

  async function joinPendingRoom() {
    if (!pendingJoinRoom) {
      return;
    }

    setIsJoiningRoom(true);
    setNotice(null);

    try {
      await apiRequest(`/rooms/${pendingJoinRoom.id}/join`, {
        method: "POST",
        headers: authHeaders(token),
      });
      setRooms((current) =>
        current.map((room) =>
          room.id === pendingJoinRoom.id
            ? { ...room, hasJoined: true, memberCount: room.hasJoined ? room.memberCount : room.memberCount + 1, unreadCount: 0 }
            : room
        )
      );
      setPendingJoinRoom(null);
      setViewMode("joined");
      setSelectedRoomId(pendingJoinRoom.id);
      setMessages([]);
      roomMessageIdsRef.current = new Set();
      setMessageBody("");
      router.push(`/rooms/${pendingJoinRoom.id}`);
      void loadRooms({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to join room.");
    } finally {
      setIsJoiningRoom(false);
    }
  }

  async function leaveSelectedRoom() {
    if (!selectedRoom || isAdmin) {
      return;
    }

    setIsLeavingRoom(true);
    setNotice(null);

    try {
      await apiRequest(`/rooms/${selectedRoom.id}/leave`, {
        method: "POST",
        headers: authHeaders(token),
      });
      socketRef.current?.emit("room:leave", { roomId: selectedRoom.id });
      setIsLeaveConfirmOpen(false);
      setRooms((current) =>
        current.map((room) =>
          room.id === selectedRoom.id
            ? { ...room, hasJoined: false, memberCount: Math.max(0, room.memberCount - 1), unreadCount: 0 }
            : room
        )
      );
      setSelectedRoomId(null);
      setMessages([]);
      roomMessageIdsRef.current = new Set();
      setMessageBody("");
      setViewMode("joined");
      router.push("/rooms");
      void loadRooms({ clearNotice: false, showLoading: false });
    } catch (error) {
      setIsLeaveConfirmOpen(false);
      setNotice(error instanceof Error ? error.message : "Unable to leave room.");
    } finally {
      setIsLeavingRoom(false);
    }
  }

  function startCreateRoom() {
    router.push("/rooms/create");
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
    setAdminRoomView("form");
    setSelectedRoomId(null);
    setNotice(null);
  }

  function startEditRoom(room: ChatRoom) {
    router.push(`/rooms/${room.id}/edit`);
    setEditingRoomId(room.id);
    setRoomForm(getRoomForm(room));
    setAdminRoomView("form");
    setSelectedRoomId(null);
    setNotice(null);
  }

  function closeAdminRoomForm() {
    router.push("/rooms");
    setAdminRoomView("list");
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
    setNotice(null);
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    setIsSavingRoom(true);
    setNotice(null);

    const payload = {
      name: roomForm.name,
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
      setAdminRoomView("list");
      setEditingRoomId(null);
      setRoomForm(emptyRoomForm);
      setNotice(editingRoomId ? "Room updated." : "Room created.");
      router.push("/rooms");
      void loadRooms({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save room.");
    } finally {
      setIsSavingRoom(false);
    }
  }

  async function toggleRoom(room: ChatRoom) {
    if (!isAdmin) {
      return;
    }

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRooms();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (adminMode === "list") {
        setAdminRoomView("list");
        setEditingRoomId(null);
        setRoomForm(emptyRoomForm);
        return;
      }

      setSelectedRoomId(null);
      setMessages([]);
      roomMessageIdsRef.current = new Set();
      setMessageBody("");
      setAdminRoomView("form");
      setEditingRoomId(adminMode === "edit" ? adminRoomId : null);
      setRoomForm(emptyRoomForm);
      setNotice(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [adminMode, adminRoomId, isAdmin]);

  useEffect(() => {
    if (!isAdmin || adminMode !== "edit" || !adminRoomId) {
      return;
    }

    const room = rooms.find((candidate) => candidate.id === adminRoomId);

    const timer = window.setTimeout(() => {
      if (room) {
        setEditingRoomId(room.id);
        setRoomForm(getRoomForm(room));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [adminMode, adminRoomId, isAdmin, rooms]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
    });
    const statusTimer = window.setTimeout(() => setSocketStatus("connecting"), 0);

    socketRef.current = socket;

    socket.on("connect", () => setSocketStatus("connected"));
    socket.on("disconnect", () => setSocketStatus("offline"));
    socket.on("connect_error", (error) => {
      setSocketStatus("offline");
      setNotice(error.message || "Unable to connect to room chat.");
    });
    socket.on("room-message:new", (message: RoomMessage) => {
      if (message.roomId === selectedRoomIdRef.current) {
        upsertMessage(message);
        void markRoomRead(message.roomId);
      } else {
        upsertMessage(message, { appendToMessages: false });
      }
    });

    return () => {
      window.clearTimeout(statusTimer);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    onRoomsLoadedRef.current = onRoomsLoaded;
    onNotificationsChangedRef.current = onNotificationsChanged;
  }, [onRoomsLoaded, onNotificationsChanged]);

  useEffect(() => {
    onRoomsLoadedRef.current(rooms);
  }, [rooms]);

  useEffect(() => {
    if (!selectedRoomId || (!selectedRoom?.hasJoined && !isAdmin)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void loadMessages(selectedRoomId);
      socketRef.current?.emit("room:join", { roomId: selectedRoomId });
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, selectedRoom?.hasJoined, isAdmin]);

  useEffect(() => {
    if (!selectedRoomId || isLoadingMessages) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const scroller = messageScrollerRef.current;

      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedRoomId, latestDisplayedMessageId, isLoadingMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAdmin) {
      setNotice("Admins can view rooms but cannot send room messages.");
      return;
    }

    if (!selectedRoomId || !messageBody.trim()) {
      return;
    }

    const socket = socketRef.current;

    if (!socket?.connected) {
      setNotice("Room chat is offline. Please wait for the socket to reconnect.");
      return;
    }

    setIsSendingMessage(true);
    setNotice(null);

    socket.emit(
      "room-message:send",
      {
        roomId: selectedRoomId,
        body: messageBody,
      },
      (response: { ok?: boolean; message?: RoomMessage; error?: string }) => {
        setIsSendingMessage(false);

        if (!response?.ok || !response.message) {
          setNotice(response?.error ?? "Unable to send message.");
          return;
        }

        setMessageBody("");
        upsertMessage(response.message);
      }
    );
  }

  if (isAdmin && adminRoomView === "form") {
    return (
      <section>
        <ScreenHeader
          eyebrow="Rooms"
          title={editingRoomId ? "Edit room." : "Create room."}
          leading={
            <button
              className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
              type="button"
              onClick={closeAdminRoomForm}
              aria-label="Back to rooms"
              title="Back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          }
        />

        <div className="px-5 pb-24 md:px-8 md:pb-8">
          {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          <form
            onSubmit={saveRoom}
            className="mx-auto max-w-2xl rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{editingRoomId ? "Edit room" : "Create room"}</h2>
                <p className="mt-1 text-sm text-[#666666]">Admin-created spaces for member conversations</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Room name"
                value={roomForm.name}
                onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
              <input
                className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Category"
                value={roomForm.category}
                onChange={(event) => setRoomForm((current) => ({ ...current, category: event.target.value }))}
                required
              />
              <textarea
                className="min-h-28 rounded-[18px] border border-black/8 p-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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

            <button
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSavingRoom}
            >
              {isSavingRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              {editingRoomId ? "Save room" : "Create room"}
            </button>
          </form>
        </div>
      </section>
    );
  }

  if (selectedRoomId && !selectedRoom) {
    return <OpeningRoomShell isAdmin={isAdmin} notice={notice} socketStatus={socketStatus} onBack={closeRoom} />;
  }

  if (selectedRoom) {
    return (
      <>
        <section className="px-0 md:px-8 md:py-8">
          <article className="mx-auto flex h-[calc(100dvh-168px)] max-w-3xl flex-col overflow-hidden bg-white md:h-180 md:rounded-[28px] md:border md:border-black/5 md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
              <button
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
                onClick={closeRoom}
                aria-label="Back to rooms"
                title="Back"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">{selectedRoom.name}</h1>
                <p className="truncate text-sm text-[#666666]">
                  {selectedRoom.category}
                </p>
              </div>

              {!isAdmin ? (
                <button
                  type="button"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-sm font-medium md:h-10 md:w-auto md:gap-2 md:px-4"
                  onClick={() => setIsLeaveConfirmOpen(true)}
                  disabled={isLeavingRoom}
                  aria-label={`Leave ${selectedRoom.name}`}
                  title="Leave"
                >
                  {isLeavingRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
                  <span className="hidden md:inline">Leave</span>
                </button>
              ) : null}

              <div className="inline-flex items-center gap-2 rounded-full bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#666666]">
                <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
                {isAdmin ? "Moderator" : socketStatus === "connected" ? "Live" : "Connecting"}
              </div>
            </div>

            {notice ? <p className="mx-4 mt-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

            <div ref={messageScrollerRef} className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] px-4 py-5">
              {isLoadingMessages ? (
                <div className="grid h-full min-h-90 place-items-center text-sm font-medium text-[#666666]">
                  Loading room messages
                </div>
              ) : messages.length > 0 ? (
                <div className="grid gap-3">
                  {datedMessages.map((item) => {
                    if (item.type === "date") {
                      return (
                        <div key={item.key} className="flex justify-center py-1">
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#777777] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            {item.label}
                          </span>
                        </div>
                      );
                    }

                    const message = item.message;
                    const isMine = message.authorId === user.id;

                    return (
                      <div key={item.key} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[82%] rounded-[20px] px-4 py-3 text-sm leading-6 ${isMine ? "rounded-br-md bg-[#18E299] text-[#0d0d0d]" : "rounded-bl-md bg-white text-[#0d0d0d]"
                            }`}
                        >
                          {!isMine ? <p className="mb-1 text-xs font-semibold text-[#0fa76e]">{message.authorName}</p> : null}
                          <p>{message.body}</p>
                          <p className={`mt-1 text-[11px] ${isMine ? "text-[#0d0d0d]/55" : "text-[#888888]"}`}>
                            {new Date(message.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid h-full min-h-90 place-items-center text-center">
                  <div>
                    <MessageCircle className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                    <h2 className="mt-3 text-2xl font-semibold">{isAdmin ? "Room is quiet" : "Start the room"}</h2>
                    <p className="mt-2 text-sm text-[#666666]">
                      {isAdmin ? "Member messages will appear here." : `Send the first message in ${selectedRoom.name}.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {isAdmin ? (
              <div className="shrink-0 border-t border-black/5 bg-white p-4 text-center text-sm font-medium text-[#666666]">
                Moderator view only
              </div>
            ) : (
              <form onSubmit={sendMessage} className="flex shrink-0 gap-3 border-t border-black/5 bg-white p-4">
                <input
                  className="h-12 min-w-0 flex-1 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  placeholder="Write to the room"
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                />
                <button
                  className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[#18E299] text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSendingMessage || !messageBody.trim()}
                  aria-label="Send message"
                  title="Send"
                >
                  {isSendingMessage ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <SendHorizontal className="size-4" aria-hidden="true" />
                  )}
                </button>
              </form>
            )}
          </article>
        </section>

        {isLeaveConfirmOpen ? (
          <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5">
            <section
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="leave-room-title"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="leave-room-title" className="text-xl font-semibold">
                    Leave this room?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#666666]">
                    {selectedRoom.name} will move back to Explore. You can join again later.
                  </p>
                </div>
                <button
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8"
                  type="button"
                  onClick={() => setIsLeaveConfirmOpen(false)}
                  disabled={isLeavingRoom}
                  aria-label="Close"
                  title="Close"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => setIsLeaveConfirmOpen(false)}
                  disabled={isLeavingRoom}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={leaveSelectedRoom}
                  disabled={isLeavingRoom}
                >
                  {isLeavingRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Leave
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Rooms"
        title={isAdmin ? "Manage rooms." : "Public rooms, curated by admin."}
        action={
          <div className="hidden items-center gap-2 rounded-full border border-black/8 px-4 py-2 text-sm font-medium md:inline-flex">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
            {socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        }
      />

      <div className="px-5 md:px-8">
        {!isAdmin ? (
          <div className="mb-4 grid grid-cols-2 rounded-full border border-black/5 bg-[#fafafa] p-1 text-sm font-medium md:max-w-sm">
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${viewMode === "joined" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setViewMode("joined")}
            >
              Joined
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${viewMode === "explore" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setViewMode("explore")}
            >
              Explore
            </button>
          </div>
        ) : null}

        {notice ? <p className="mb-4 rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isAdmin ? (
          <div className="mb-4 flex items-center justify-end">
            <button
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
              type="button"
              onClick={startCreateRoom}
            >
              <Plus className="size-4" aria-hidden="true" />
              Create Room
            </button>
          </div>
        ) : null}

        {isLoadingRooms ? (
          <div className="grid min-h-105 place-items-center rounded-[28px] border border-black/5">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading rooms</p>
            </div>
          </div>
        ) : visibleRooms.length > 0 ? (
          <div className="grid gap-3">
            {visibleRooms.map((room) => (
              <article
                key={room.id}
                className="rounded-3xl border border-black/5 bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{room.name}</h2>
                      <span className="rounded-full bg-[#d4fae8] px-2.5 py-1 text-xs font-medium text-[#0fa76e]">
                        {room.category}
                      </span>
                      {isAdmin ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${room.isActive ? "bg-[#d4fae8] text-[#0fa76e]" : "bg-[#fafafa] text-[#777777]"
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
                          onClick={() => startEditRoom(room)}
                          aria-label={`Edit ${room.name}`}
                          title="Edit"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
                          type="button"
                          onClick={() => toggleRoom(room)}
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
                      onClick={() => (room.hasJoined || isAdmin ? openJoinedRoom(room) : requestJoinRoom(room))}
                      aria-label={`${room.hasJoined || isAdmin ? "Enter" : "Join"} ${room.name}`}
                      title={room.hasJoined || isAdmin ? "Enter room" : "Join room"}
                    >
                      <ArrowRight className="size-4" aria-hidden="true" />
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#18E299] px-3 py-1 font-semibold text-[#0d0d0d]">
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
              <MessageCircle className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">
                {viewMode === "joined" && !isAdmin ? "No joined rooms yet" : "No rooms yet"}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">
                {viewMode === "joined" && !isAdmin
                  ? "Rooms you join from Explore will appear here."
                  : "Admin-created rooms will appear here once they are active."}
              </p>
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/8 px-5 text-sm font-medium"
                onClick={() => loadRooms()}
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
                onClick={() => setPendingJoinRoom(null)}
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
                onClick={() => setPendingJoinRoom(null)}
              >
                No
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={joinPendingRoom}
                disabled={isJoiningRoom}
              >
                {isJoiningRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Yes
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
