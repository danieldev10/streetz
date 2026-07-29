import type {
  FormEventHandler,
  KeyboardEventHandler,
  MouseEvent,
  RefObject,
} from "react";
import {
  ArrowLeft,
  LoaderCircle,
  LogOut,
  MessageCircle,
  SendHorizontal,
  Users,
  X,
} from "lucide-react";
import { ChatGif } from "@/components/chat/chat-gif";
import { ChatMediaPicker } from "@/components/chat/chat-media-picker";
import { LoadingState } from "@/components/loading-state";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import type { DatedMessageItem } from "@/lib/chat-dates";
import type { ChatRoom, DiscoveryCandidate, RoomMember, RoomMessage } from "@/lib/types";
import { ROOM_MESSAGE_MAX_LENGTH } from "./room-model";
import { renderRoomMessageBody } from "./room-message-content";

export function RoomThreadView({
  room,
  userId,
  isAdmin,
  notice,
  socketStatus,
  messages,
  datedMessages,
  members,
  mentionSuggestions,
  activeMentionSuggestionIndex,
  isMentionMenuOpen,
  messageBody,
  selectedGifUrl,
  isLoadingMessages,
  isSendingMessage,
  isLeavingRoom,
  isLeaveConfirmOpen,
  messageScrollerRef,
  messageInputRef,
  onBack,
  onOpenMembers,
  onOpenMember,
  onRequestLeave,
  onCloseLeave,
  onConfirmLeave,
  onSubmitMessage,
  onMessageBodyChange,
  onMessageInputKeyDown,
  onSyncMessageCaret,
  onInsertMention,
  onEmoji,
  onGif,
  onRemoveGif,
}: {
  room: ChatRoom;
  userId: string | null;
  isAdmin: boolean;
  notice: string | null;
  socketStatus: "connecting" | "connected" | "offline";
  messages: RoomMessage[];
  datedMessages: Array<DatedMessageItem<RoomMessage>>;
  members: RoomMember[];
  mentionSuggestions: RoomMember[];
  activeMentionSuggestionIndex: number;
  isMentionMenuOpen: boolean;
  messageBody: string;
  selectedGifUrl: string | null;
  isLoadingMessages: boolean;
  isSendingMessage: boolean;
  isLeavingRoom: boolean;
  isLeaveConfirmOpen: boolean;
  messageScrollerRef: RefObject<HTMLDivElement | null>;
  messageInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onOpenMembers: () => void;
  onOpenMember: (member: DiscoveryCandidate) => void;
  onRequestLeave: () => void;
  onCloseLeave: () => void;
  onConfirmLeave: () => void;
  onSubmitMessage: FormEventHandler<HTMLFormElement>;
  onMessageBodyChange: (value: string, input: HTMLInputElement) => void;
  onMessageInputKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onSyncMessageCaret: (input: HTMLInputElement) => void;
  onInsertMention: (member: RoomMember) => void;
  onEmoji: (emoji: string) => void;
  onGif: (url: string) => void;
  onRemoveGif: () => void;
}) {
  return (
    <>
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

            <button
              type="button"
              className="min-w-0 flex-1 rounded-[18px] p-1 text-left transition hover:bg-[#fafafa]"
              onClick={onOpenMembers}
              aria-label={`View ${room.name} members`}
            >
              <h1 className="truncate text-lg font-semibold">{room.name}</h1>
              <p className="truncate text-sm text-[#666666]">
                {room.category} · {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
              </p>
            </button>

            {!isAdmin ? (
              <button
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-sm font-medium md:h-10 md:w-auto md:gap-2 md:px-4"
                onClick={onRequestLeave}
                disabled={isLeavingRoom}
                aria-label={`Leave ${room.name}`}
                title="Leave"
              >
                {isLeavingRoom ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
                <span className="hidden md:inline">Leave</span>
              </button>
            ) : null}

            <div className="inline-flex items-center gap-2 rounded-full bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#666666]">
              <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#bd40be]" : "bg-[#c6c6c6]"}`} />
              {isAdmin ? "Moderator" : socketStatus === "connected" ? "Live" : "Connecting"}
            </div>
          </div>

          {notice ? <p className="mx-4 mt-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

          <div ref={messageScrollerRef} className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] px-4 py-5">
            {isLoadingMessages ? (
              <LoadingState label="Loading room messages" className="h-full min-h-90" />
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
                  const isMine = message.authorId === userId;
                  const author = message.author ?? members.find((member) => member.id === message.authorId) ?? null;

                  return (
                    <div key={item.key} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                      {!isMine ? (
                        <button
                          type="button"
                          className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f6e0f6] text-[#0d0d0d] disabled:cursor-default"
                          onClick={() => {
                            if (author) {
                              onOpenMember(author);
                            }
                          }}
                          disabled={!author}
                          aria-label={author ? `View ${author.displayName} profile` : `View ${message.authorName} profile`}
                        >
                          {author ? (
                            <CandidatePhoto candidate={author} variant="thumb" />
                          ) : (
                            <Users className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      ) : null}
                      <div
                        className={`max-w-[82%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
                          isMine
                            ? "rounded-br-md bg-[#9d2a9e] text-white"
                            : "rounded-bl-md bg-white text-[#0d0d0d]"
                        }`}
                      >
                        {!isMine ? <p className="mb-1 text-xs font-semibold text-[#9d2a9e]">{message.authorName}</p> : null}
                        {message.gifUrl ? <ChatGif url={message.gifUrl} /> : null}
                        {message.body ? (
                          <p className={`whitespace-pre-wrap break-words ${message.gifUrl ? "mt-2" : ""}`}>
                            {renderRoomMessageBody(message.body, members, userId, onOpenMember, isMine)}
                          </p>
                        ) : null}
                        <p className={`mt-1 text-[11px] ${isMine ? "text-white/70" : "text-[#888888]"}`}>
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
                  <MessageCircle className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
                  <h2 className="mt-3 text-2xl font-semibold">{isAdmin ? "Room is quiet" : "Start the room"}</h2>
                  <p className="mt-2 text-sm text-[#666666]">
                    {isAdmin ? "Member messages will appear here." : `Send the first message in ${room.name}.`}
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
            <form onSubmit={onSubmitMessage} className="relative flex shrink-0 items-center gap-2 border-t border-black/5 bg-white p-4">
              {selectedGifUrl ? (
                <div className="absolute bottom-full left-4 mb-2 flex items-center gap-2 rounded-2xl border border-black/8 bg-white p-2 shadow-lg">
                  <ChatGif url={selectedGifUrl} alt="Selected GIF" />
                  <button type="button" className="rounded-full px-2 py-1 text-xs font-semibold" onClick={onRemoveGif}>
                    Remove
                  </button>
                </div>
              ) : null}
              <ChatMediaPicker
                disabled={isSendingMessage}
                onEmoji={onEmoji}
                onGif={onGif}
              />
              <div className="relative min-w-0 flex-1">
                {isMentionMenuOpen ? (
                  <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-[24px] border border-black/5 bg-white p-2 shadow-[0_16px_38px_rgba(0,0,0,0.14)]">
                    {mentionSuggestions.map((member, index) => {
                      const location = [member.city, member.state].filter(Boolean).join(", ") || "Nigeria";
                      const isActiveMention = index === activeMentionSuggestionIndex;

                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={`flex w-full items-center gap-3 rounded-[18px] p-2 text-left transition ${
                            isActiveMention ? "bg-[#f6e0f6]" : "hover:bg-[#fafafa]"
                          }`}
                          onMouseDown={(mouseEvent: MouseEvent<HTMLButtonElement>) => {
                            mouseEvent.preventDefault();
                            onInsertMention(member);
                          }}
                        >
                          <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-[#f6e0f6]">
                            <CandidatePhoto candidate={member} variant="thumb" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#0d0d0d]">@{member.displayName}</p>
                            <p className="truncate text-xs text-[#666666]">{location}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <input
                  ref={messageInputRef}
                  className="h-12 w-full rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
                  placeholder="Write to the room or tag @name"
                  value={messageBody}
                  onChange={(event) => onMessageBodyChange(event.target.value, event.currentTarget)}
                  onKeyDown={onMessageInputKeyDown}
                  onClick={(event) => onSyncMessageCaret(event.currentTarget)}
                  onSelect={(event) => onSyncMessageCaret(event.currentTarget)}
                  maxLength={ROOM_MESSAGE_MAX_LENGTH}
                />
              </div>
              <button
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[#9d2a9e] text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSendingMessage || (!messageBody.trim() && !selectedGifUrl)}
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
                  {room.name} will move back to Explore. You can join again later.
                </p>
              </div>
              <button
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8"
                type="button"
                onClick={onCloseLeave}
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
                onClick={onCloseLeave}
                disabled={isLeavingRoom}
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onConfirmLeave}
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
