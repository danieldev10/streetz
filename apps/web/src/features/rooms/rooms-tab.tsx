"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageCircle,
  RefreshCw,
  SendHorizontal,
  Users,
  X,
} from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { SOCKET_URL, apiRequest, authHeaders } from "@/lib/api";
import type { ChatRoom, RoomMessage, StreetzUser } from "@/lib/types";

type RoomViewMode = "explore" | "joined";

export function RoomsTab({ token, user }: { token: string; user: StreetzUser }) {
  const isAdmin = user.role === "ADMIN";
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<ChatRoom | null>(null);
  const [viewMode, setViewMode] = useState<RoomViewMode>("explore");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedRoomIdRef = useRef<string | null>(selectedRoomId);
  const roomMessageIdsRef = useRef<Set<string>>(new Set());

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );
  const joinedRooms = rooms.filter((room) => room.hasJoined);
  const exploreRooms = isAdmin ? rooms : rooms.filter((room) => !room.hasJoined);
  const visibleRooms = viewMode === "joined" && !isAdmin ? joinedRooms : exploreRooms;

  async function loadRooms(options: { clearNotice?: boolean; showLoading?: boolean } = {}) {
    const { clearNotice = true, showLoading = true } = options;

    if (showLoading) {
      setIsLoadingRooms(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const response = await apiRequest<{ rooms: ChatRoom[] }>("/rooms", {
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

    setSelectedRoomId(null);
    setMessages([]);
    roomMessageIdsRef.current = new Set();
    setMessageBody("");
    setNotice(null);
  }

  function upsertMessage(message: RoomMessage) {
    if (roomMessageIdsRef.current.has(message.id)) {
      return;
    }

    roomMessageIdsRef.current.add(message.id);
    setMessages((current) => [...current, message]);
    setRooms((current) =>
      current.map((room) =>
        room.id === message.roomId ? { ...room, messageCount: room.messageCount + 1, updatedAt: message.createdAt } : room
      )
    );
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
            ? { ...room, hasJoined: true, memberCount: room.hasJoined ? room.memberCount : room.memberCount + 1 }
            : room
        )
      );
      setPendingJoinRoom(null);
      setViewMode("joined");
      openJoinedRoom({ ...pendingJoinRoom, hasJoined: true, memberCount: pendingJoinRoom.memberCount + 1 });
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
      setRooms((current) =>
        current.map((room) =>
          room.id === selectedRoom.id
            ? { ...room, hasJoined: false, memberCount: Math.max(0, room.memberCount - 1) }
            : room
        )
      );
      setSelectedRoomId(null);
      setMessages([]);
      roomMessageIdsRef.current = new Set();
      setMessageBody("");
      setViewMode("joined");
      void loadRooms({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to leave room.");
    } finally {
      setIsLeavingRoom(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRooms();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      } else {
        setRooms((current) =>
          current.map((room) =>
            room.id === message.roomId ? { ...room, messageCount: room.messageCount + 1, updatedAt: message.createdAt } : room
          )
        );
      }
    });

    return () => {
      window.clearTimeout(statusTimer);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

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

  if (selectedRoom) {
    return (
      <section className="px-0 md:px-8 md:py-8">
        <article className="mx-auto flex min-h-[calc(100dvh-168px)] max-w-3xl flex-col overflow-hidden bg-white md:min-h-[720px] md:rounded-[28px] md:border md:border-black/[0.05] md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3">
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
              onClick={closeRoom}
              aria-label="Back to rooms"
              title="Back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">{selectedRoom.name}</h1>
              <p className="truncate text-sm text-[#666666]">
                {selectedRoom.city} · {selectedRoom.category}
              </p>
            </div>

            {!isAdmin ? (
              <button
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-sm font-medium md:h-10 md:w-auto md:gap-2 md:px-4"
                onClick={leaveSelectedRoom}
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

          {notice ? <p className="mx-4 mt-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          <div className="flex-1 overflow-y-auto bg-[#fafafa] px-4 py-5">
            {isLoadingMessages ? (
              <div className="grid h-full min-h-[360px] place-items-center text-sm font-medium text-[#666666]">
                Loading room messages
              </div>
            ) : messages.length > 0 ? (
              <div className="grid gap-3">
                {messages.map((message) => {
                  const isMine = message.authorId === user.id;

                  return (
                    <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[82%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
                          isMine ? "rounded-br-md bg-[#18E299] text-[#0d0d0d]" : "rounded-bl-md bg-white text-[#0d0d0d]"
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
              <div className="grid h-full min-h-[360px] place-items-center text-center">
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
            <div className="border-t border-black/[0.05] bg-white p-4 text-center text-sm font-medium text-[#666666]">
              Moderator view only
            </div>
          ) : (
            <form onSubmit={sendMessage} className="flex gap-3 border-t border-black/[0.05] bg-white p-4">
              <input
                className="h-12 min-w-0 flex-1 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
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
    );
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Rooms"
        title={isAdmin ? "Moderate active rooms." : "Public rooms, curated by admin."}
        action={
          <div className="hidden items-center gap-2 rounded-full border border-black/[0.08] px-4 py-2 text-sm font-medium md:inline-flex">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
            {socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        }
      />

      <div className="px-5 md:px-8">
        {!isAdmin ? (
          <div className="mb-4 grid grid-cols-2 rounded-full border border-black/[0.05] bg-[#fafafa] p-1 text-sm font-medium md:max-w-sm">
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${viewMode === "explore" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setViewMode("explore")}
            >
              Explore
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${viewMode === "joined" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => setViewMode("joined")}
            >
              Joined
            </button>
          </div>
        ) : null}

        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingRooms ? (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05]">
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
                className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{room.name}</h2>
                      <span className="rounded-full bg-[#d4fae8] px-2.5 py-1 text-xs font-medium text-[#0fa76e]">
                        {room.category}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#666666]">{room.description || "Open member conversation."}</p>
                  </div>
                  <button
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08]"
                    onClick={() => (room.hasJoined || isAdmin ? openJoinedRoom(room) : requestJoinRoom(room))}
                    aria-label={`${room.hasJoined || isAdmin ? "Enter" : "Join"} ${room.name}`}
                    title={room.hasJoined || isAdmin ? "Enter room" : "Join room"}
                  >
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-[#666666]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {room.city}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1">
                    <Users className="size-3.5" aria-hidden="true" />
                    {room.memberCount} members
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1">
                    <MessageCircle className="size-3.5" aria-hidden="true" />
                    {room.messageCount} messages
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05] p-6 text-center">
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
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/[0.08] px-5 text-sm font-medium"
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
          <section className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Join this room?</h2>
                <p className="mt-2 text-sm leading-6 text-[#666666]">{pendingJoinRoom.name}</p>
              </div>
              <button
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08]"
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
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-5 text-sm font-medium"
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
