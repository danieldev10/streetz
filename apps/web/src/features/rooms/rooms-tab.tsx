"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL, apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { buildDatedMessageItems } from "@/lib/chat-dates";
import { queryKeys } from "@/lib/query-keys";
import type { ChatRoom, DiscoveryCandidate, RoomMember, RoomMessage, StreetzUser } from "@/lib/types";
import { MemberProfileView } from "@/features/discovery/member-profile-view";
import { useChatAutoScroll } from "@/lib/use-chat-autoscroll";
import {
  MENTION_SUGGESTION_LIMIT,
  ROOM_MESSAGE_MAX_LENGTH,
  getRoomMessageTime,
  mergeCachedRoomMessages,
} from "./room-model";
import { getMentionSearch, getUniqueRoomMembers } from "./room-message-content";
import { OpeningRoomShell } from "./opening-room-shell";
import { RoomMembersView } from "./room-members-view";
import { RoomThreadView } from "./room-thread-view";

export function RoomsTab({
  token,
  user,
  initialRooms = [],
  initialSelectedRoomId = null,
  onRoomsLoaded,
  onNotificationsChanged,
}: {
  token?: string | null;
  user?: StreetzUser | null;
  initialRooms?: ChatRoom[];
  initialSelectedRoomId?: string | null;
  onRoomsLoaded?: (rooms: ChatRoom[]) => void;
  onNotificationsChanged?: () => void;
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
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [messages, setMessages] = useState<RoomMessage[]>(initialCachedMessages ?? []);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [viewedRoomProfile, setViewedRoomProfile] = useState<DiscoveryCandidate | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(Boolean(initialSelectedRoomId && initialCachedMessages === undefined));
  const [isLoadingRoomMembers, setIsLoadingRoomMembers] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
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
  const latestDisplayedMessage = displayedMessages[displayedMessages.length - 1] ?? null;
  const latestDisplayedMessageId = latestDisplayedMessage?.id ?? null;
  const { hasNewMessages, handleScroll, scrollToBottom } = useChatAutoScroll({
    scrollerRef: messageScrollerRef,
    threadId: selectedRoomId,
    latestMessageId: latestDisplayedMessageId,
    isOwnLatestMessage: Boolean(latestDisplayedMessage && latestDisplayedMessage.authorId === user?.id),
    isLoading: isLoadingMessages,
  });
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

  async function loadRooms() {
    setNotice(null);

    try {
      const response = await apiRequest<{ rooms: ChatRoom[] }>(
        isAdmin ? "/admin/rooms" : "/rooms",
        { headers: authHeaders(token as string) }
      );
      if (initialSelectedRoomId && !response.rooms.some((room) => room.id === initialSelectedRoomId)) {
        router.replace("/events");
        return;
      }
      setRooms(response.rooms);
      setSelectedRoomId((current) => {
        if (current && response.rooms.some((room) => room.id === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
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

  function closeRoom() {
    if (selectedRoomId) {
      socketRef.current?.emit("room:leave", { roomId: selectedRoomId });
    }

    router.push("/events");
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
      router.push("/events");
    } catch (error) {
      setIsLeaveConfirmOpen(false);
      setNotice(getUserErrorMessage(error));
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
  }, [token, isAdmin, isGuest]);

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
      return;
    }

    if (isAdmin) {
      setNotice("Admins can view event chats but cannot send messages.");
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
      setNotice("Event chat is temporarily unavailable. Please try again shortly.");
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
        hasNewMessages={hasNewMessages}
        onMessagesScroll={handleScroll}
        onJumpToLatest={() => scrollToBottom("smooth")}
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

  return <OpeningRoomShell isAdmin={isAdmin} notice={notice} socketStatus={socketStatus} onBack={closeRoom} />;
}
