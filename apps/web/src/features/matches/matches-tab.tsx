"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { ArrowDown, ArrowLeft, CheckCheck, LoaderCircle, MessageCircle, MessagesSquare, RefreshCw, Search, SendHorizontal } from "lucide-react";
import { ListSkeleton, MessageThreadSkeleton } from "@/components/skeletons";
import { useChatAutoScroll } from "@/lib/use-chat-autoscroll";
import { SOCKET_URL, apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { buildDatedMessageItems } from "@/lib/chat-dates";
import { queryKeys } from "@/lib/query-keys";
import type { DirectMessage, DiscoveryCandidate, MatchThread, StreetzUser } from "@/lib/types";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { MemberProfileView } from "@/features/discovery/member-profile-view";
import { ChatGif } from "@/components/chat/chat-gif";
import { ChatMediaPicker } from "@/components/chat/chat-media-picker";
import { CHAT_PANEL_HEIGHT } from "@/lib/chat-layout";

function getMatchActivityTime(match: MatchThread) {
  return Date.parse(match.lastMessage?.createdAt ?? match.createdAt) || 0;
}

function getDirectMessageTime(message: DirectMessage) {
  return Date.parse(message.createdAt) || 0;
}

function getUnavailableAccountLabel(candidate: DiscoveryCandidate | null | undefined) {
  if (!candidate?.accountStatus || candidate.accountStatus === "ACTIVE") {
    return null;
  }

  if (candidate.accountStatus === "DEACTIVATED") {
    return "This account is currently deactivated.";
  }

  if (candidate.accountStatus === "SUSPENDED") {
    return "This account is temporarily unavailable.";
  }

  return "This account is unavailable.";
}

function getBlockedMatchLabel(match: MatchThread | null | undefined) {
  if (!match || !match.blockStatus || match.blockStatus === "NONE") {
    return null;
  }

  if (match.blockStatus === "BLOCKED_ME") {
    return "You have been blocked by this member, so you cannot send messages.";
  }

  if (match.blockStatus === "BLOCKED_BY_ME") {
    return "You blocked this account. Unblock them from Blocked Accounts to message again.";
  }

  return "You and this member have blocked each other, so messages are unavailable.";
}

function getMatchUnavailableLabel(match: MatchThread | null | undefined) {
  return getBlockedMatchLabel(match) ?? getUnavailableAccountLabel(match?.user);
}

type DirectMessageReadReceipt = {
  matchId: string;
  readerId: string;
  messageIds: string[];
  readAt: string;
};

type MatchUnmatchedEvent = {
  matchId: string;
  actorId: string;
};

const DIRECT_MESSAGE_MAX_LENGTH = 1000;
const DIRECT_MESSAGE_CACHE_LIMIT = 100;

function mergeCachedDirectMessages(current: DirectMessage[] | undefined, incoming: DirectMessage[]) {
  const byId = new Map((current ?? []).map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((first, second) => getDirectMessageTime(first) - getDirectMessageTime(second))
    .slice(-DIRECT_MESSAGE_CACHE_LIMIT);
}

function OpeningMatchShell({
  notice,
  socketStatus,
  onBack,
}: {
  notice: string | null;
  socketStatus: "connecting" | "connected" | "offline";
  onBack: () => void;
}) {
  return (
    <section className="px-0 md:px-8 md:py-8">
      <article className={`mx-auto flex ${CHAT_PANEL_HEIGHT} max-w-3xl flex-col overflow-hidden bg-surface md:rounded-[28px] md:border md:border-black/[0.05] md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]`}>
        <div className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3">
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-ink"
            onClick={onBack}
            aria-label="Back to matches"
            title="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="h-5 w-32 rounded-full bg-surface-shade" />
            <div className="mt-2 h-3 w-24 rounded-full bg-surface-sunken" />
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-2 text-xs font-medium text-ink-600">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-brand" : "bg-ink-200"}`} />
            {socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        </div>

        {notice ? <p className="mx-4 mt-4 rounded-[16px] bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        <div className="grid min-h-0 flex-1 place-items-center bg-surface-muted px-4 py-5">
          <LoaderCircle className="size-7 animate-spin text-brand" aria-hidden="true" />
          <span className="sr-only">Loading chat</span>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-black/[0.05] bg-surface p-4">
          <div className="h-12 min-w-0 flex-1 rounded-full border border-black/[0.08] bg-surface-muted" />
          <div className="size-12 shrink-0 rounded-full bg-brand-tint" />
        </div>
      </article>
    </section>
  );
}

export function MatchesTab({
  token,
  user,
  initialMatches = [],
  initialSelectedMatchId = null,
  onMatchesLoaded,
  onMatchOpened,
  onNotificationsChanged,
}: {
  token: string;
  user: StreetzUser;
  initialMatches?: MatchThread[];
  initialSelectedMatchId?: string | null;
  onMatchesLoaded: (matches: MatchThread[]) => void;
  onMatchOpened: (match: MatchThread) => void;
  onNotificationsChanged: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const initialCachedMessages = initialSelectedMatchId
    ? queryClient.getQueryData<DirectMessage[]>(queryKeys.directMessages(user.id, initialSelectedMatchId))
    : undefined;
  const [matches, setMatches] = useState<MatchThread[]>(initialMatches);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(initialSelectedMatchId);
  const [viewedMatchProfile, setViewedMatchProfile] = useState<DiscoveryCandidate | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>(initialCachedMessages ?? []);
  const [messageBody, setMessageBody] = useState("");
  const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [isLoadingMatches, setIsLoadingMatches] = useState(initialMatches.length === 0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(Boolean(initialSelectedMatchId && initialCachedMessages === undefined));
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedMatchIdRef = useRef<string | null>(selectedMatchId);
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const onMatchesLoadedRef = useRef(onMatchesLoaded);
  const onNotificationsChangedRef = useRef(onNotificationsChanged);
  const seenMatchNotificationIdsRef = useRef<Set<string>>(new Set());

  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? null;
  const selectedMatchUnavailableLabel = getMatchUnavailableLabel(selectedMatch);
  const displayedMessages = useMemo(
    () => [...messages].sort((first, second) => getDirectMessageTime(first) - getDirectMessageTime(second)),
    [messages]
  );
  const datedMessages = useMemo(() => buildDatedMessageItems(displayedMessages), [displayedMessages]);
  const latestDisplayedMessage = displayedMessages[displayedMessages.length - 1] ?? null;
  const latestDisplayedMessageId = latestDisplayedMessage?.id ?? null;
  const { hasNewMessages, handleScroll, scrollToBottom } = useChatAutoScroll({
    scrollerRef: messageScrollerRef,
    threadId: selectedMatchId,
    latestMessageId: latestDisplayedMessageId,
    isOwnLatestMessage: Boolean(latestDisplayedMessage && latestDisplayedMessage.senderId === user.id),
    isLoading: isLoadingMessages,
  });
  const filteredMatches = useMemo(() => {
    const query = matchSearch.trim().toLowerCase();

    const visibleMatches = query
      ? matches.filter((match) => {
        const haystack = [
          match.user.displayName,
          match.user.city,
          match.user.state,
          match.lastMessage?.body,
          ...match.user.interests,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      : matches;

    return [...visibleMatches].sort((first, second) => getMatchActivityTime(second) - getMatchActivityTime(first));
  }, [matches, matchSearch]);
  function getMatchPreview(match: MatchThread) {
    const unavailableLabel = getMatchUnavailableLabel(match);

    if (unavailableLabel) {
      return unavailableLabel;
    }

    if (match.lastMessage) {
      const prefix = match.lastMessage.senderId === user.id ? "You: " : "";
      return `${prefix}${match.lastMessage.body || (match.lastMessage.gifUrl ? "GIF" : "Message")}`;
    }

    return `Matched · ${match.user.city ?? "Nigeria"}`;
  }

  function openMatch(matchId: string) {
    const match = matches.find((candidate) => candidate.id === matchId);

    setNotice(null);
    setSelectedMatchId(matchId);
    setViewedMatchProfile(null);
    router.push(`/matches/${matchId}`);
    setSelectedGifUrl(null);

    if (match) {
      onMatchOpened(match);
      clearMatchUnread(matchId);
      void markMatchRead(matchId);
    }
  }

  function closeMatch() {
    router.push("/matches");
    setSelectedMatchId(null);
    setViewedMatchProfile(null);
    setMessages([]);
    setMessageBody("");
    setSelectedGifUrl(null);
    setNotice(null);
  }

  async function loadMatches() {
    if (matches.length === 0) {
      setIsLoadingMatches(true);
    }
    setNotice(null);

    try {
      const response = await apiRequest<{ matches: MatchThread[] }>("/matches", {
        headers: authHeaders(token),
      });
      setMatches(response.matches);
      setSelectedMatchId((current) => {
        if (current && response.matches.some((match) => match.id === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsLoadingMatches(false);
    }
  }

  async function loadMessages(matchId: string) {
    const queryKey = queryKeys.directMessages(user.id, matchId);
    const cachedMessages = queryClient.getQueryData<DirectMessage[]>(queryKey);
    const hasCachedMessages = cachedMessages !== undefined;

    if (hasCachedMessages && selectedMatchIdRef.current === matchId) {
      setMessages(cachedMessages);
    }

    setIsLoadingMessages(!hasCachedMessages);
    setNotice(null);

    try {
      const nextMessages = await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => {
          const response = await apiRequest<{ messages: DirectMessage[] }>(`/matches/${matchId}/messages`, {
            headers: authHeaders(token),
          });
          return mergeCachedDirectMessages(queryClient.getQueryData<DirectMessage[]>(queryKey), response.messages);
        },
        staleTime: 30_000,
      });

      if (selectedMatchIdRef.current === matchId) {
        setMessages(nextMessages);
      }
      clearMatchUnread(matchId);
      onNotificationsChangedRef.current();
    } catch (error) {
      if (!hasCachedMessages) setNotice(getUserErrorMessage(error));
    } finally {
      if (selectedMatchIdRef.current === matchId) setIsLoadingMessages(false);
    }
  }

  function upsertMessage(message: DirectMessage, options: { appendToMessages?: boolean } = {}) {
    const { appendToMessages = true } = options;
    const queryKey = queryKeys.directMessages(user.id, message.matchId);
    let isNewMessage = true;
    const nextCachedMessages = queryClient.setQueryData<DirectMessage[]>(queryKey, (current) => {
      if (current?.some((candidate) => candidate.id === message.id)) {
        isNewMessage = false;
        return current;
      }
      return mergeCachedDirectMessages(current, [message]);
    });

    if (appendToMessages && nextCachedMessages) {
      setMessages(nextCachedMessages);
    } else if (!appendToMessages) {
      void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
    }

    if (!isNewMessage) return;

    setMatches((current) => {
      const nextMatches = current.map((match) => {
        if (match.id !== message.matchId) {
          return match;
        }

        const isSelected = match.id === selectedMatchIdRef.current;
        const isMine = message.senderId === user.id;

        return {
          ...match,
          lastMessage: message,
          unreadCount: isSelected || isMine ? 0 : (match.unreadCount ?? 0) + 1,
        };
      });

      return nextMatches;
    });
  }

  function clearMatchUnread(matchId: string) {
    setMatches((current) => {
      const nextMatches = current.map((match) => (match.id === matchId ? { ...match, unreadCount: 0 } : match));

      return nextMatches;
    });
  }

  function applyReadReceipt(receipt: DirectMessageReadReceipt) {
    if (receipt.readerId === user.id || receipt.messageIds.length === 0) {
      return;
    }

    const readMessageIds = new Set(receipt.messageIds);
    const queryKey = queryKeys.directMessages(user.id, receipt.matchId);
    const nextCachedMessages = queryClient.setQueryData<DirectMessage[]>(queryKey, (current) =>
      current?.map((message) => (readMessageIds.has(message.id) ? { ...message, readAt: receipt.readAt } : message))
    );

    if (receipt.matchId === selectedMatchIdRef.current && nextCachedMessages) setMessages(nextCachedMessages);
    setMatches((current) =>
      current.map((match) =>
        match.id === receipt.matchId && match.lastMessage && readMessageIds.has(match.lastMessage.id)
          ? { ...match, lastMessage: { ...match.lastMessage, readAt: receipt.readAt } }
          : match
      )
    );
  }

  async function markMatchRead(matchId: string) {
    try {
      await apiRequest(`/matches/${matchId}/read`, {
        method: "POST",
        headers: authHeaders(token),
      });
      onNotificationsChangedRef.current();
    } catch {
      // The next summary refresh will reconcile read state.
    }
  }

  async function markMatchNotificationSeen(matchId: string) {
    if (seenMatchNotificationIdsRef.current.has(matchId)) {
      return;
    }

    try {
      await apiRequest("/notifications/feed/seen", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          items: [
            {
              kind: "MATCH_CREATED",
              entityId: matchId,
            },
          ],
        }),
      });
      seenMatchNotificationIdsRef.current.add(matchId);
      onNotificationsChangedRef.current();
    } catch {
      // Opening the thread is still useful; notification seen state can retry later.
    }
  }

  async function unmatchMatch(match: MatchThread) {
    await apiRequest<{ unmatched: boolean; matchId: string; otherUserId: string }>(`/matches/${match.id}/unmatch`, {
      method: "POST",
      headers: authHeaders(token),
    });

    setMatches((current) => current.filter((item) => item.id !== match.id));
    router.push("/matches");
    setSelectedMatchId(null);
    setViewedMatchProfile(null);
    queryClient.removeQueries({ queryKey: queryKeys.directMessages(user.id, match.id), exact: true });
    setMessages([]);
    setMessageBody("");
    setSelectedGifUrl(null);
    setNotice("Match removed.");
    onNotificationsChangedRef.current();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMatches();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
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
    socket.on("direct-message:new", (message: DirectMessage) => {
      if (message.matchId === selectedMatchIdRef.current) {
        upsertMessage(message);
        void markMatchRead(message.matchId);
      } else {
        upsertMessage(message, { appendToMessages: false });
      }
    });
    socket.on("direct-message:read", (receipt: DirectMessageReadReceipt) => {
      applyReadReceipt(receipt);
    });
    socket.on("match:unmatched", (event: MatchUnmatchedEvent) => {
      setMatches((current) => current.filter((match) => match.id !== event.matchId));
      queryClient.removeQueries({ queryKey: queryKeys.directMessages(user.id, event.matchId), exact: true });

      if (event.matchId === selectedMatchIdRef.current) {
        router.push("/matches");
        setSelectedMatchId(null);
        setViewedMatchProfile(null);
        setMessages([]);
        setMessageBody("");
        setNotice(event.actorId === user.id ? "Match removed." : "This match is no longer available.");
      }

      onNotificationsChangedRef.current();
    });

    return () => {
      window.clearTimeout(statusTimer);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    selectedMatchIdRef.current = selectedMatchId;
  }, [selectedMatchId]);

  useEffect(() => {
    onMatchesLoadedRef.current = onMatchesLoaded;
    onNotificationsChangedRef.current = onNotificationsChanged;
  }, [onMatchesLoaded, onNotificationsChanged]);

  useEffect(() => {
    onMatchesLoadedRef.current(matches);
  }, [matches]);

  useEffect(() => {
    if (!selectedMatchId) {
      const timer = window.setTimeout(() => {
        setMessages([]);
      }, 0);

      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void markMatchNotificationSeen(selectedMatchId);
      void loadMessages(selectedMatchId);
      socketRef.current?.emit("match:join", { matchId: selectedMatchId });
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = messageBody.trim();

    if (!selectedMatchId || (!body && !selectedGifUrl)) {
      return;
    }

    if (selectedMatchUnavailableLabel) {
      setNotice(selectedMatchUnavailableLabel);
      return;
    }

    if (body.length > DIRECT_MESSAGE_MAX_LENGTH) {
      setNotice(`Messages must be ${DIRECT_MESSAGE_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const socket = socketRef.current;

    if (!socket?.connected) {
      setNotice("Live messaging is temporarily unavailable. Please try again shortly.");
      return;
    }

    setIsSendingMessage(true);
    setNotice(null);

    socket.emit(
      "direct-message:send",
      {
        matchId: selectedMatchId,
        body,
        gifUrl: selectedGifUrl,
      },
      (response: { ok?: boolean; message?: DirectMessage; error?: string }) => {
        setIsSendingMessage(false);

        if (!response?.ok || !response.message) {
          setNotice("We ran into a problem. Please try again.");
          return;
        }

        setMessageBody("");
        setSelectedGifUrl(null);
        upsertMessage(response.message);
      }
    );
  }

  if (selectedMatch && viewedMatchProfile) {
    return (
      <MemberProfileView
        candidate={viewedMatchProfile}
        onBack={() => setViewedMatchProfile(null)}
        backLabel="Back to chat"
        token={token}
        matchedConnectionStatus={selectedMatch.matchedConnectionStatus}
        showSafetyActions
        showUnmatchAction={selectedMatch.blockStatus === "NONE"}
        onUnmatched={() => unmatchMatch(selectedMatch)}
        onBlocked={(candidate) => {
          setMatches((current) => current.filter((match) => match.user.id !== candidate.id));
          closeMatch();
          setNotice("Profile blocked.");
        }}
      />
    );
  }

  if (selectedMatchId && !selectedMatch) {
    return <OpeningMatchShell notice={notice} socketStatus={socketStatus} onBack={closeMatch} />;
  }

  if (selectedMatch) {
    return (
      <section className="px-0 md:px-8 md:py-8">
        <article className={`mx-auto flex ${CHAT_PANEL_HEIGHT} max-w-3xl flex-col overflow-hidden bg-surface md:rounded-[28px] md:border md:border-black/[0.05] md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]`}>
          <div className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3">
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-ink"
              onClick={closeMatch}
              aria-label="Back to matches"
              title="Back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] p-1 text-left transition hover:bg-surface-muted"
              onClick={() => setViewedMatchProfile(selectedMatch.user)}
              aria-label={`View ${selectedMatch.user.displayName} profile`}
            >
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-brand-tint">
                <CandidatePhoto candidate={selectedMatch.user} variant="thumb" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">{selectedMatch.user.displayName}</h1>
                <p className="truncate text-sm text-ink-600">
                  {[selectedMatch.user.city, selectedMatch.user.state].filter(Boolean).join(", ") || "Nigeria"}
                </p>
              </div>
            </button>

            <div className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-2 text-xs font-medium text-ink-600">
              <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-brand" : "bg-ink-200"}`} />
              {socketStatus === "connected" ? "Live" : "Connecting"}
            </div>
          </div>

          {notice ? <p className="mx-4 mt-4 rounded-[16px] bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

          <div className="relative min-h-0 flex-1">
            {hasNewMessages ? (
              <button
                type="button"
                className="absolute bottom-4 left-1/2 z-10 inline-flex h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
                onClick={() => scrollToBottom("smooth")}
              >
                <ArrowDown className="size-4" aria-hidden="true" />
                New messages
              </button>
            ) : null}

            <div ref={messageScrollerRef} onScroll={handleScroll} className="h-full overflow-y-auto bg-surface-muted px-4 py-5">
              {isLoadingMessages ? (
                <MessageThreadSkeleton label="Loading messages" className="h-full" />
              ) : messages.length > 0 ? (
                <div className="grid gap-3">
                  {datedMessages.map((item) => {
                    if (item.type === "date") {
                      return (
                        <div key={item.key} className="flex justify-center py-1">
                          <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-ink-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            {item.label}
                          </span>
                        </div>
                      );
                    }

                    const message = item.message;
                    const isMine = message.senderId === user.id;

                    return (
                      <div key={item.key} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                        {!isMine ? (
                          <button
                            type="button"
                            className="relative size-7 shrink-0 overflow-hidden rounded-full bg-brand-tint"
                            onClick={() => setViewedMatchProfile(selectedMatch.user)}
                            aria-label={`View ${selectedMatch.user.displayName} profile`}
                          >
                            <CandidatePhoto candidate={selectedMatch.user} variant="thumb" />
                          </button>
                        ) : null}
                        <div
                          className={`max-w-[78%] rounded-[20px] px-4 py-3 text-sm leading-6 ${isMine ? "rounded-br-md bg-brand-strong text-white" : "rounded-bl-md bg-surface text-ink"
                            }`}
                        >
                          {message.gifUrl ? <ChatGif url={message.gifUrl} /> : null}
                          {message.body ? <p className={message.gifUrl ? "mt-2" : undefined}>{message.body}</p> : null}
                          <p
                            className={`mt-1 flex items-center gap-1 text-[11px] ${isMine ? "justify-end text-white/70" : "text-ink-400"
                              }`}
                          >
                            <span>
                              {new Date(message.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {isMine ? (
                              <span
                                className="inline-flex"
                                aria-label={message.readAt ? "Read" : "Delivered"}
                                title={message.readAt ? "Read" : "Delivered"}
                              >
                                <CheckCheck
                                  className={`size-3.5 ${message.readAt ? "text-white" : "text-white/50"}`}
                                  aria-hidden="true"
                                />
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid h-full min-h-[360px] place-items-center text-center">
                  <div>
                    <MessageCircle className="mx-auto size-8 text-brand" aria-hidden="true" />
                    <h2 className="mt-3 text-2xl font-semibold">Start the chat</h2>
                    <p className="mt-2 text-sm text-ink-600">Send the first message to {selectedMatch.user.displayName}.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedMatchUnavailableLabel ? (
            <div className="shrink-0 border-t border-black/[0.05] bg-surface p-4">
              <p className="rounded-[18px] bg-warning-tint px-4 py-3 text-center text-sm font-medium leading-6 text-warning">
                {selectedMatchUnavailableLabel}
              </p>
            </div>
          ) : (
            <form onSubmit={sendMessage} className="relative flex shrink-0 items-center gap-2 border-t border-black/[0.05] bg-surface p-4">
              {selectedGifUrl ? (
                <div className="absolute bottom-full left-4 mb-2 flex items-center gap-2 rounded-2xl border border-black/8 bg-surface p-2 shadow-lg">
                  <ChatGif url={selectedGifUrl} alt="Selected GIF" />
                  <button type="button" className="rounded-full px-2 py-1 text-xs font-semibold" onClick={() => setSelectedGifUrl(null)}>Remove</button>
                </div>
              ) : null}
              <ChatMediaPicker
                disabled={isSendingMessage}
                onEmoji={(emoji) => setMessageBody((current) => `${current}${emoji}`)}
                onGif={setSelectedGifUrl}
              />
              <input
                className="h-12 min-w-0 flex-1 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="Write a message"
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                maxLength={DIRECT_MESSAGE_MAX_LENGTH}
              />
              <button
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-strong text-white disabled:cursor-not-allowed disabled:opacity-60"
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
    );
  }

  return (
    <section>
      <h1 className="sr-only">Matches</h1>
      <div className="px-5 pt-6 md:px-8 md:pt-8">
        <div className="mb-4 hidden items-center justify-end md:flex">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] px-4 py-2 text-sm font-medium">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-brand" : "bg-ink-200"}`} />
            {socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        </div>

        {notice ? <p className="mb-4 rounded-[16px] bg-brand-tint p-3 text-sm font-medium text-brand-deep">{notice}</p> : null}

        {isLoadingMatches ? (
          <ListSkeleton label="Loading matches" className="mx-auto grid max-w-3xl gap-3" hasAction={false} />
        ) : matches.length > 0 ? (
          <div className="mx-auto max-w-3xl">

            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input
                id="match-search"
                className="h-12 w-full rounded-full border border-black/[0.08] pl-11 pr-4 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="Search name, city, interest"
                value={matchSearch}
                onChange={(event) => setMatchSearch(event.target.value)}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border border-black/[0.05] bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              {filteredMatches.length > 0 ? (
                filteredMatches.map((match) => {
                  const unreadCount = match.unreadCount ?? 0;

                  return (
                    <button
                      key={match.id}
                      className="flex w-full items-center gap-4 border-b border-black/[0.05] px-4 py-4 text-left transition last:border-b-0 hover:bg-surface-muted"
                      onClick={() => openMatch(match.id)}
                    >
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-brand-tint sm:size-20">
                        <CandidatePhoto candidate={match.user} variant="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-lg font-semibold">{match.user.displayName}</p>
                          {unreadCount > 0 ? (
                            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-brand-strong px-1 text-[10px] font-semibold leading-5 text-white">
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                          ) : (
                            <p className="shrink-0 text-xs font-medium text-ink-300">
                              {new Date(match.lastMessage?.createdAt ?? match.createdAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-ink-600">{getMatchPreview(match)}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="grid min-h-[260px] place-items-center p-6 text-center">
                  <div>
                    <Search className="mx-auto size-8 text-brand" aria-hidden="true" />
                    <h2 className="mt-3 text-2xl font-semibold">No matches found</h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-ink-600">Try another name, city, or interest.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto grid min-h-[420px] max-w-3xl place-items-center rounded-[28px] border border-black/[0.05] p-6 text-center">
            <div>
              <MessagesSquare className="mx-auto size-8 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No matches yet</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-600">
                When someone likes you back, they will appear here.
              </p>
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/[0.08] px-5 text-sm font-medium"
                onClick={loadMatches}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
