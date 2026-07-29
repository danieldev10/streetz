"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { type AuthPromptKind } from "@/components/app/public-route";
import { SOCKET_URL, apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { buildDatedMessageItems } from "@/lib/chat-dates";
import { queryKeys } from "@/lib/query-keys";
import type { ChatRoom, DiscoveryCandidate, RoomMember, RoomMessage, StreetzUser } from "@/lib/types";
import { MemberProfileView } from "@/features/discovery/member-profile-view";
import {
  MENTION_SUGGESTION_LIMIT,
  ROOM_CATEGORY_MAX_LENGTH,
  ROOM_DESCRIPTION_MAX_LENGTH,
  ROOM_MESSAGE_MAX_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  emptyRoomForm,
  getRoomActivityTime,
  getRoomForm,
  getRoomMessageTime,
  mergeCachedRoomMessages,
  type AdminRoomMode,
  type AdminRoomView,
  type RoomForm,
  type RoomViewMode,
} from "./room-model";
import { getMentionSearch, getUniqueRoomMembers } from "./room-message-content";
import { OpeningRoomShell } from "./opening-room-shell";
import { RoomMembersView } from "./room-members-view";
import { AdminRoomFormView } from "./admin-room-form-view";
import { RoomThreadView } from "./room-thread-view";
import { RoomsListView } from "./rooms-list-view";

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
  onAuthRequired,
}: {
  token?: string | null;
  user?: StreetzUser | null;
  initialRooms?: ChatRoom[];
  initialSelectedRoomId?: string | null;
  adminMode?: AdminRoomMode;
  adminRoomId?: string | null;
  onRoomsLoaded?: (rooms: ChatRoom[]) => void;
  onRoomOpened?: (room: ChatRoom) => void;
  onNotificationsChanged?: () => void;
  onAuthRequired?: (kind?: AuthPromptKind) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isGuest = !token || !user;
  const isAdmin = user?.role === "ADMIN";
  const initialCachedMessages = initialSelectedRoomId && user
    ? queryClient.getQueryData<RoomMessage[]>(queryKeys.roomMessages(user.id, initialSelectedRoomId))
    : undefined;
  const [rooms, setRooms] = useState<ChatRoom[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialSelectedRoomId);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<ChatRoom | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [viewMode, setViewMode] = useState<RoomViewMode>(isAdmin ? "active" : isGuest ? "explore" : "joined");
  const [adminRoomView, setAdminRoomView] = useState<AdminRoomView>(adminMode === "list" ? "list" : "form");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(adminMode === "edit" ? adminRoomId : null);
  const [roomForm, setRoomForm] = useState<RoomForm>(emptyRoomForm);
  const [messages, setMessages] = useState<RoomMessage[]>(initialCachedMessages ?? []);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [viewedRoomProfile, setViewedRoomProfile] = useState<DiscoveryCandidate | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(initialRooms.length === 0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(Boolean(initialSelectedRoomId && initialCachedMessages === undefined));
  const [isLoadingRoomMembers, setIsLoadingRoomMembers] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const [pendingToggleRoom, setPendingToggleRoom] = useState<ChatRoom | null>(null);
  const [isTogglingRoom, setIsTogglingRoom] = useState(false);
  const [isRoomMembersOpen, setIsRoomMembersOpen] = useState(false);
  const [messageCaretIndex, setMessageCaretIndex] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedRoomIdRef = useRef<string | null>(selectedRoomId);
  const roomMessageIdsRef = useRef<Set<string>>(new Set((initialCachedMessages ?? []).map((message) => message.id)));
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const onRoomsLoadedRef = useRef(onRoomsLoaded ?? (() => undefined));
  const onNotificationsChangedRef = useRef(onNotificationsChanged ?? (() => undefined));

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
  const exploreRooms = orderedRooms.filter((room) => !room.hasJoined);
  const activeRooms = orderedRooms.filter((room) => room.isActive);
  const inactiveRooms = orderedRooms.filter((room) => !room.isActive);
  const visibleRooms = isAdmin
    ? viewMode === "inactive" ? inactiveRooms : activeRooms
    : isGuest ? activeRooms : viewMode === "joined" ? joinedRooms : exploreRooms;

  const mentionableRoomMembers = useMemo(
    () => getUniqueRoomMembers(roomMembers).filter((member) => member.id !== user?.id),
    [roomMembers, user?.id]
  );
  const mentionSearch = useMemo(() => getMentionSearch(messageBody, messageCaretIndex), [messageBody, messageCaretIndex]);
  const mentionSuggestions = useMemo(() => {
    if (!mentionSearch) {
      return [];
    }

    const query = mentionSearch.query.toLocaleLowerCase();

    return mentionableRoomMembers
      .filter((member) => {
        const name = member.displayName.toLocaleLowerCase();

        return !query || name.startsWith(query) || name.includes(query);
      })
      .slice(0, MENTION_SUGGESTION_LIMIT);
  }, [mentionSearch, mentionableRoomMembers]);
  const isMentionMenuOpen = mentionSuggestions.length > 0;
  const activeMentionSuggestionIndex = mentionSuggestions.length > 0 ? Math.min(activeMentionIndex, mentionSuggestions.length - 1) : 0;

  async function loadRooms(options: { clearNotice?: boolean; showLoading?: boolean } = {}) {
    const { clearNotice = true, showLoading = true } = options;

    if (showLoading && rooms.length === 0) {
      setIsLoadingRooms(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const response = await apiRequest<{ rooms: ChatRoom[] }>(
        isGuest ? "/public/rooms" : isAdmin ? "/admin/rooms" : "/rooms",
        isGuest ? undefined : { headers: authHeaders(token as string) }
      );
      setRooms(response.rooms);
      setSelectedRoomId((current) => {
        if (current && response.rooms.some((room) => room.id === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      if (showLoading) {
        setIsLoadingRooms(false);
      }
    }
  }

  async function loadMessages(roomId: string) {
    if (!token || !user) {
      return;
    }

    const queryKey = queryKeys.roomMessages(user.id, roomId);
    const cachedMessages = queryClient.getQueryData<RoomMessage[]>(queryKey);
    const hasCachedMessages = cachedMessages !== undefined;

    if (hasCachedMessages && selectedRoomIdRef.current === roomId) {
      setMessages(cachedMessages);
      roomMessageIdsRef.current = new Set(cachedMessages.map((message) => message.id));
    }

    setIsLoadingMessages(!hasCachedMessages);
    setNotice(null);

    try {
      const nextMessages = await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => {
          const response = await apiRequest<{ messages: RoomMessage[] }>(`/rooms/${roomId}/messages`, {
            headers: authHeaders(token),
          });
          return mergeCachedRoomMessages(queryClient.getQueryData<RoomMessage[]>(queryKey), response.messages);
        },
        staleTime: 30_000
      });

      if (selectedRoomIdRef.current === roomId) {
        setMessages(nextMessages);
        roomMessageIdsRef.current = new Set(nextMessages.map((message) => message.id));
      }
      clearRoomUnread(roomId);
      onNotificationsChangedRef.current();
    } catch (error) {
      if (!hasCachedMessages) setNotice(getUserErrorMessage(error));
    } finally {
      if (selectedRoomIdRef.current === roomId) setIsLoadingMessages(false);
    }
  }

  async function loadRoomMembers(roomId: string) {
    if (!token) {
      return;
    }

    setIsLoadingRoomMembers(true);
    setNotice(null);

    try {
      const response = await apiRequest<{ members: RoomMember[] }>(`/rooms/${roomId}/members`, {
        headers: authHeaders(token as string),
      });
      setRoomMembers(response.members);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsLoadingRoomMembers(false);
    }
  }

  function openRoomMembers() {
    if (!selectedRoom) {
      return;
    }

    setIsRoomMembersOpen(true);
    setViewedRoomProfile(null);
    void loadRoomMembers(selectedRoom.id);
  }

  function closeRoomMembers() {
    setIsRoomMembersOpen(false);
    setViewedRoomProfile(null);
    setNotice(null);
  }

  function openJoinedRoom(room: ChatRoom) {
    if (isGuest) {
      onAuthRequired?.("roomJoin");
      return;
    }

    setOpeningRoomId(room.id);
    router.push(`/rooms/${room.id}`);

    if (!isAdmin) {
      onRoomOpened?.(room);
      clearRoomUnread(room.id);
      void markRoomRead(room.id);
    }
  }

  function requestJoinRoom(room: ChatRoom) {
    if (isGuest) {
      onAuthRequired?.("roomJoin");
      return;
    }

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
    setRoomMembers([]);
    roomMessageIdsRef.current = new Set();
    setMessageBody("");
    setSelectedGifUrl(null);
    setMessageCaretIndex(0);
    setActiveMentionIndex(0);
    setIsRoomMembersOpen(false);
    setViewedRoomProfile(null);
    setNotice(null);
  }

  function upsertMessage(message: RoomMessage, options: { appendToMessages?: boolean } = {}) {
    const { appendToMessages = true } = options;
    let isNewMessage = true;

    if (user) {
      const queryKey = queryKeys.roomMessages(user.id, message.roomId);
      const nextCachedMessages = queryClient.setQueryData<RoomMessage[]>(queryKey, (current) => {
        if (current?.some((candidate) => candidate.id === message.id)) {
          isNewMessage = false;
          return current;
        }
        return mergeCachedRoomMessages(current, [message]);
      });

      if (!appendToMessages) {
        void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
      }

      if (appendToMessages && nextCachedMessages) {
        roomMessageIdsRef.current.add(message.id);
        setMessages(nextCachedMessages);
      }
    }

    if (!isNewMessage) return;

    setRooms((current) => {
      const nextRooms = current.map((room) => {
        if (room.id !== message.roomId) {
          return room;
        }

        const isSelected = room.id === selectedRoomIdRef.current;
        const isMine = message.authorId === user?.id;

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
    if (!token) {
      return;
    }

    try {
      await apiRequest(`/rooms/${roomId}/read`, {
        method: "POST",
        headers: authHeaders(token as string),
      });
      onNotificationsChangedRef.current();
    } catch {
      // The periodic notification refresh will reconcile read state.
    }
  }

  async function joinPendingRoom() {
    if (!pendingJoinRoom || !token) {
      return;
    }

    setIsJoiningRoom(true);
    setNotice(null);

    try {
      await apiRequest(`/rooms/${pendingJoinRoom.id}/join`, {
        method: "POST",
        headers: authHeaders(token as string),
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
      setOpeningRoomId(pendingJoinRoom.id);
      router.push(`/rooms/${pendingJoinRoom.id}`);
      void loadRooms({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsJoiningRoom(false);
    }
  }

  async function leaveSelectedRoom() {
    if (!selectedRoom || isAdmin || !token || !user) {
      return;
    }

    setIsLeavingRoom(true);
    setNotice(null);

    try {
      await apiRequest(`/rooms/${selectedRoom.id}/leave`, {
        method: "POST",
        headers: authHeaders(token as string),
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
      queryClient.removeQueries({ queryKey: queryKeys.roomMessages(user.id, selectedRoom.id), exact: true });
      setMessages([]);
      roomMessageIdsRef.current = new Set();
      setMessageBody("");
      setSelectedGifUrl(null);
      setMessageCaretIndex(0);
      setActiveMentionIndex(0);
      setViewMode("joined");
      router.push("/rooms");
      void loadRooms({ clearNotice: false, showLoading: false });
    } catch (error) {
      setIsLeaveConfirmOpen(false);
      setNotice(getUserErrorMessage(error));
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

    setNotice(null);

    const name = roomForm.name.trim();
    const category = roomForm.category.trim();
    const description = roomForm.description.trim();

    if (name.length < 2) {
      setNotice("Room name must be at least 2 characters.");
      return;
    }

    if (name.length > ROOM_NAME_MAX_LENGTH) {
      setNotice(`Room name must be ${ROOM_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }

    if (category.length < 2) {
      setNotice("Room category must be at least 2 characters.");
      return;
    }

    if (category.length > ROOM_CATEGORY_MAX_LENGTH) {
      setNotice(`Room category must be ${ROOM_CATEGORY_MAX_LENGTH} characters or fewer.`);
      return;
    }

    if (description.length > ROOM_DESCRIPTION_MAX_LENGTH) {
      setNotice(`Room description must be ${ROOM_DESCRIPTION_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setIsSavingRoom(true);

    const payload = {
      name,
      category,
      description,
      isActive: roomForm.isActive,
    };

    try {
      const savedRoom = await apiRequest<ChatRoom>(
        editingRoomId ? `/admin/rooms/${editingRoomId}` : "/admin/rooms",
        {
          method: editingRoomId ? "PUT" : "POST",
          headers: authHeaders(token as string),
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
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSavingRoom(false);
    }
  }

  async function toggleRoom(room: ChatRoom) {
    if (!isAdmin) {
      return;
    }

    setIsTogglingRoom(true);
    setNotice(null);

    try {
      const updatedRoom = await apiRequest<ChatRoom>(`/admin/rooms/${room.id}`, {
        method: "PUT",
        headers: authHeaders(token as string),
        body: JSON.stringify({ isActive: !room.isActive }),
      });
      setRooms((current) => current.map((item) => (item.id === updatedRoom.id ? updatedRoom : item)));

      if (editingRoomId === room.id) {
        setRoomForm(getRoomForm(updatedRoom));
      }
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsTogglingRoom(false);
      setPendingToggleRoom(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRooms();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, isGuest]);

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
      setMessageCaretIndex(0);
      setActiveMentionIndex(0);
      setAdminRoomView("form");
      setNotice(null);

      if (adminMode === "create") {
        setEditingRoomId(null);
        setRoomForm(emptyRoomForm);
        return;
      }

      setEditingRoomId(adminRoomId);
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
    if (isGuest || !token) {
      const offlineTimer = window.setTimeout(() => setSocketStatus("offline"), 0);

      return () => window.clearTimeout(offlineTimer);
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    const statusTimer = window.setTimeout(() => setSocketStatus("connecting"), 0);

    socketRef.current = socket;

    socket.on("connect", () => setSocketStatus("connected"));
    socket.on("disconnect", () => setSocketStatus("offline"));
    socket.on("connect_error", () => {
      setSocketStatus("offline");
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
  }, [token, isGuest]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    onRoomsLoadedRef.current = onRoomsLoaded ?? (() => undefined);
    onNotificationsChangedRef.current = onNotificationsChanged ?? (() => undefined);
  }, [onRoomsLoaded, onNotificationsChanged]);

  useEffect(() => {
    onRoomsLoadedRef.current(rooms);
  }, [rooms]);

  useEffect(() => {
    if (isGuest || !selectedRoomId || (!selectedRoom?.hasJoined && !isAdmin)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void loadMessages(selectedRoomId);
      void loadRoomMembers(selectedRoomId);
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

  function syncMessageCaret(input: HTMLInputElement) {
    setMessageCaretIndex(input.selectionStart ?? input.value.length);
  }

  function insertMention(member: RoomMember) {
    const caretIndex = messageInputRef.current?.selectionStart ?? messageCaretIndex;
    const search = getMentionSearch(messageBody, caretIndex);

    if (!search) {
      return;
    }

    const mention = `@${member.displayName.trim()} `;
    const nextBody = `${messageBody.slice(0, search.start)}${mention}${messageBody.slice(search.end)}`;

    if (nextBody.length > ROOM_MESSAGE_MAX_LENGTH) {
      setNotice(`Messages must be ${ROOM_MESSAGE_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const nextCaretIndex = search.start + mention.length;
    setMessageBody(nextBody);
    setMessageCaretIndex(nextCaretIndex);
    setActiveMentionIndex(0);

    window.requestAnimationFrame(() => {
      const input = messageInputRef.current;

      if (!input) {
        return;
      }

      input.focus();
      input.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  function handleMessageInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isMentionMenuOpen) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveMentionIndex((current) => (current + 1) % mentionSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMentionIndex((current) => (current - 1 + mentionSuggestions.length) % mentionSuggestions.length);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertMention(mentionSuggestions[activeMentionSuggestionIndex] ?? mentionSuggestions[0]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setActiveMentionIndex(0);
      setMessageCaretIndex(messageBody.length);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isGuest) {
      onAuthRequired?.("roomJoin");
      return;
    }

    if (isAdmin) {
      setNotice("Admins can view rooms but cannot send room messages.");
      return;
    }

    const body = messageBody.trim();

    if (!selectedRoomId || (!body && !selectedGifUrl)) {
      return;
    }

    if (body.length > ROOM_MESSAGE_MAX_LENGTH) {
      setNotice(`Messages must be ${ROOM_MESSAGE_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const socket = socketRef.current;

    if (!socket?.connected) {
      setNotice("Room chat is temporarily unavailable. Please try again shortly.");
      return;
    }

    setIsSendingMessage(true);
    setNotice(null);

    socket.emit(
      "room-message:send",
      {
        roomId: selectedRoomId,
        body,
        gifUrl: selectedGifUrl,
      },
      (response: { ok?: boolean; message?: RoomMessage; error?: string }) => {
        setIsSendingMessage(false);

        if (!response?.ok || !response.message) {
          setNotice("We ran into a problem. Please try again.");
          return;
        }

        setMessageBody("");
        setSelectedGifUrl(null);
        setMessageCaretIndex(0);
        setActiveMentionIndex(0);
        upsertMessage(response.message);
      }
    );
  }

  if (isAdmin && adminRoomView === "form") {
    return (
      <AdminRoomFormView
        editingRoomId={editingRoomId}
        roomForm={roomForm}
        notice={notice}
        isSaving={isSavingRoom}
        onBack={closeAdminRoomForm}
        onSubmit={saveRoom}
        onChange={(patch) => setRoomForm((current) => ({ ...current, ...patch }))}
      />
    );
  }

  if (selectedRoom && viewedRoomProfile) {
    return (
      <MemberProfileView
        candidate={viewedRoomProfile}
        onBack={() => setViewedRoomProfile(null)}
        backLabel={isRoomMembersOpen ? "Back to members" : "Back to chat"}
        token={token ?? undefined}
        showSafetyActions={!isAdmin && viewedRoomProfile.id !== user?.id}
        onBlocked={(candidate) => {
          setRoomMembers((current) => current.filter((member) => member.id !== candidate.id));
          setViewedRoomProfile(null);
          setNotice("Profile blocked.");
        }}
      />
    );
  }

  if (selectedRoom && isRoomMembersOpen) {
    return (
      <RoomMembersView
        room={selectedRoom}
        members={roomMembers}
        isLoading={isLoadingRoomMembers}
        notice={notice}
        onBack={closeRoomMembers}
        onOpenMember={setViewedRoomProfile}
      />
    );
  }

  if (selectedRoomId && !selectedRoom) {
    return <OpeningRoomShell isAdmin={isAdmin} notice={notice} socketStatus={socketStatus} onBack={closeRoom} />;
  }

  if (selectedRoom) {
    return (
      <RoomThreadView
        room={selectedRoom}
        userId={user?.id ?? null}
        isAdmin={isAdmin}
        notice={notice}
        socketStatus={socketStatus}
        messages={messages}
        datedMessages={datedMessages}
        members={roomMembers}
        mentionSuggestions={mentionSuggestions}
        activeMentionSuggestionIndex={activeMentionSuggestionIndex}
        isMentionMenuOpen={isMentionMenuOpen}
        messageBody={messageBody}
        selectedGifUrl={selectedGifUrl}
        isLoadingMessages={isLoadingMessages}
        isSendingMessage={isSendingMessage}
        isLeavingRoom={isLeavingRoom}
        isLeaveConfirmOpen={isLeaveConfirmOpen}
        messageScrollerRef={messageScrollerRef}
        messageInputRef={messageInputRef}
        onBack={closeRoom}
        onOpenMembers={openRoomMembers}
        onOpenMember={setViewedRoomProfile}
        onRequestLeave={() => setIsLeaveConfirmOpen(true)}
        onCloseLeave={() => setIsLeaveConfirmOpen(false)}
        onConfirmLeave={leaveSelectedRoom}
        onSubmitMessage={sendMessage}
        onMessageBodyChange={(value, input) => {
          setMessageBody(value);
          setActiveMentionIndex(0);
          syncMessageCaret(input);
        }}
        onMessageInputKeyDown={handleMessageInputKeyDown}
        onSyncMessageCaret={syncMessageCaret}
        onInsertMention={insertMention}
        onEmoji={(emoji) => setMessageBody((current) => `${current}${emoji}`)}
        onGif={setSelectedGifUrl}
        onRemoveGif={() => setSelectedGifUrl(null)}
      />
    );
  }

  return (
    <RoomsListView
      isGuest={isGuest}
      isAdmin={isAdmin}
      socketStatus={socketStatus}
      viewMode={viewMode}
      visibleRooms={visibleRooms}
      notice={notice}
      isLoadingRooms={isLoadingRooms}
      openingRoomId={openingRoomId}
      pendingJoinRoom={pendingJoinRoom}
      isJoiningRoom={isJoiningRoom}
      pendingToggleRoom={pendingToggleRoom}
      isTogglingRoom={isTogglingRoom}
      onStartCreateRoom={startCreateRoom}
      onViewModeChange={setViewMode}
      onStartEditRoom={startEditRoom}
      onOpenRoom={(room) => (room.hasJoined || isAdmin ? openJoinedRoom(room) : requestJoinRoom(room))}
      onRefresh={() => void loadRooms()}
      onCloseJoin={() => setPendingJoinRoom(null)}
      onConfirmJoin={joinPendingRoom}
      onRequestToggle={setPendingToggleRoom}
      onCloseToggle={() => setPendingToggleRoom(null)}
      onConfirmToggle={(room) => void toggleRoom(room)}
    />
  );
}
