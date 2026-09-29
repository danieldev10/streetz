"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { SOCKET_URL, apiRequest, getUserErrorMessage } from "@/lib/api";
import { buildDatedMessageItems } from "@/lib/chat-dates";
import type { ChatRoom, RoomMessage } from "@/lib/types";
import { useChatAutoScroll } from "@/lib/use-chat-autoscroll";
import { mergeCachedRoomMessages } from "./room-model";
import { RoomThreadView } from "./room-thread-view";

type PublicRoomResponse = {
  room: ChatRoom;
  messages: RoomMessage[];
};

export function GuestRoomView({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const datedMessages = useMemo(() => buildDatedMessageItems(messages), [messages]);
  const latestMessageId = messages[messages.length - 1]?.id ?? null;
  const { hasNewMessages, handleScroll, scrollToBottom } = useChatAutoScroll({
    scrollerRef: messageScrollerRef,
    threadId: roomId,
    latestMessageId,
    isOwnLatestMessage: false,
    isLoading,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadRoom() {
      setIsLoading(true);
      setNotice(null);

      try {
        const response = await apiRequest<PublicRoomResponse>(
          `/public/rooms/${encodeURIComponent(roomId)}?limit=100`
        );

        if (cancelled) return;

        setRoom(response.room);
        setMessages((current) => mergeCachedRoomMessages(response.messages, current));
      } catch (error) {
        if (!cancelled) {
          setNotice(getUserErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRoom();

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    const socket = io(`${SOCKET_URL}/public-rooms`, {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit(
        "public-room:join",
        { roomId },
        (response: { ok?: boolean; error?: string }) => {
          if (response?.ok) {
            setSocketStatus("connected");
            return;
          }

          setSocketStatus("offline");
          setNotice(response?.error ?? "This event chat is not available.");
        }
      );
    });
    socket.on("disconnect", () => setSocketStatus("offline"));
    socket.on("connect_error", () => setSocketStatus("offline"));
    socket.on("public-room-message:new", (message: RoomMessage) => {
      if (message.roomId !== roomId) return;
      setMessages((current) => mergeCachedRoomMessages(current, [message]));
    });

    return () => {
      socket.emit("public-room:leave", { roomId });
      socket.disconnect();
    };
  }, [roomId]);

  const goBack = () => router.push(room?.eventId ? `/events/${room.eventId}` : "/events");

  if (!room) {
    return (
      <section className="px-5 py-8 md:px-8">
        <div className="mx-auto grid min-h-72 max-w-3xl place-items-center rounded-[28px] border border-black/5 bg-surface p-6 text-center">
          <div>
            <p className="text-sm font-medium text-ink-600">
              {isLoading ? "Opening event chat..." : notice ?? "This event chat is not available."}
            </p>
            {!isLoading ? (
              <button
                type="button"
                className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-white"
                onClick={goBack}
              >
                Back to events
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <RoomThreadView
      room={room}
      userId={null}
      isAdmin={false}
      isGuest
      notice={notice}
      socketStatus={socketStatus}
      messages={messages}
      datedMessages={datedMessages}
      members={[]}
      mentionSuggestions={[]}
      activeMentionSuggestionIndex={0}
      isMentionMenuOpen={false}
      messageBody=""
      selectedGifUrl={null}
      isLoadingMessages={isLoading}
      isSendingMessage={false}
      isLeavingRoom={false}
      isLeaveConfirmOpen={false}
      messageScrollerRef={messageScrollerRef}
      messageInputRef={messageInputRef}
      hasNewMessages={hasNewMessages}
      onMessagesScroll={handleScroll}
      onJumpToLatest={() => scrollToBottom("smooth")}
      onBack={goBack}
      onOpenMembers={() => undefined}
      onOpenMember={() => undefined}
      onRequestLeave={() => undefined}
      onCloseLeave={() => undefined}
      onConfirmLeave={() => undefined}
      onSubmitMessage={(event) => event.preventDefault()}
      onMessageBodyChange={() => undefined}
      onMessageInputKeyDown={() => undefined}
      onSyncMessageCaret={() => undefined}
      onInsertMention={() => undefined}
      onEmoji={() => undefined}
      onGif={() => undefined}
      onRemoveGif={() => undefined}
    />
  );
}
