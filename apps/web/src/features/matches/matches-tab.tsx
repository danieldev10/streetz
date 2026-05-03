"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ArrowLeft, LoaderCircle, MessageCircle, MessagesSquare, RefreshCw, Search, SendHorizontal } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { SOCKET_URL, apiRequest, authHeaders } from "@/lib/api";
import { getMatchActivityWeight } from "@/lib/match-activity";
import type { DirectMessage, DiscoveryCandidate, MatchThread, StreetzUser } from "@/lib/types";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { MemberProfileView } from "@/features/discovery/member-profile-view";

export function MatchesTab({
  token,
  user,
  onMatchesLoaded,
  onMatchOpened,
}: {
  token: string;
  user: StreetzUser;
  onMatchesLoaded: (matches: MatchThread[]) => void;
  onMatchOpened: (match: MatchThread) => void;
}) {
  const [matches, setMatches] = useState<MatchThread[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [viewedMatchProfile, setViewedMatchProfile] = useState<DiscoveryCandidate | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [matchSearch, setMatchSearch] = useState("");
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const selectedMatchIdRef = useRef<string | null>(selectedMatchId);
  const matchesRef = useRef<MatchThread[]>(matches);
  const onMatchesLoadedRef = useRef(onMatchesLoaded);
  const onMatchOpenedRef = useRef(onMatchOpened);

  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? null;
  const filteredMatches = useMemo(() => {
    const query = matchSearch.trim().toLowerCase();

    if (!query) {
      return matches;
    }

    return matches.filter((match) => {
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
    });
  }, [matches, matchSearch]);
  const matchActivityWeights = useMemo(() => {
    const weights = new Map<string, number>();

    for (const match of matches) {
      weights.set(match.id, getMatchActivityWeight(user.id, match));
    }

    return weights;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, user.id, activityVersion]);

  function getMatchPreview(match: MatchThread) {
    if (match.lastMessage) {
      const prefix = match.lastMessage.senderId === user.id ? "You: " : "";
      return `${prefix}${match.lastMessage.body}`;
    }

    return `Matched · ${match.user.city ?? "Nigeria"}`;
  }

  function openMatch(matchId: string) {
    const match = matches.find((candidate) => candidate.id === matchId);

    setNotice(null);
    setSelectedMatchId(matchId);
    setViewedMatchProfile(null);

    if (match) {
      onMatchOpened(match);
      setActivityVersion((current) => current + 1);
    }
  }

  function closeMatch() {
    setSelectedMatchId(null);
    setViewedMatchProfile(null);
    setMessages([]);
    setMessageBody("");
    setNotice(null);
  }

  async function loadMatches() {
    setIsLoadingMatches(true);
    setNotice(null);

    try {
      const response = await apiRequest<{ matches: MatchThread[] }>("/matches", {
        headers: authHeaders(token),
      });
      setMatches(response.matches);
      onMatchesLoaded(response.matches);
      setSelectedMatchId((current) => {
        if (current && response.matches.some((match) => match.id === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load matches.");
    } finally {
      setIsLoadingMatches(false);
    }
  }

  async function loadMessages(matchId: string) {
    setIsLoadingMessages(true);

    try {
      const response = await apiRequest<{ messages: DirectMessage[] }>(`/matches/${matchId}/messages`, {
        headers: authHeaders(token),
      });
      setMessages(response.messages);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load messages.");
    } finally {
      setIsLoadingMessages(false);
    }
  }

  function upsertMessage(message: DirectMessage) {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) {
        return current;
      }

      return [...current, message];
    });
    setMatches((current) =>
      current.map((match) => (match.id === message.matchId ? { ...match, lastMessage: message } : match))
    );
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
      transports: ["websocket"],
    });
    const statusTimer = window.setTimeout(() => setSocketStatus("connecting"), 0);

    socketRef.current = socket;

    socket.on("connect", () => setSocketStatus("connected"));
    socket.on("disconnect", () => setSocketStatus("offline"));
    socket.on("connect_error", (error) => {
      setSocketStatus("offline");
      setNotice(error.message || "Unable to connect to live messaging.");
    });
    socket.on("direct-message:new", (message: DirectMessage) => {
      if (message.matchId === selectedMatchIdRef.current) {
        upsertMessage(message);
        const currentMatch = matchesRef.current.find((match) => match.id === message.matchId);

        if (currentMatch) {
          onMatchOpenedRef.current({ ...currentMatch, lastMessage: message });
          setActivityVersion((current) => current + 1);
        }
      } else {
        setMatches((current) => {
          const nextMatches = current.map((match) => (match.id === message.matchId ? { ...match, lastMessage: message } : match));
          onMatchesLoadedRef.current(nextMatches);
          return nextMatches;
        });
      }
    });

    return () => {
      window.clearTimeout(statusTimer);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    selectedMatchIdRef.current = selectedMatchId;
  }, [selectedMatchId]);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    onMatchesLoadedRef.current = onMatchesLoaded;
    onMatchOpenedRef.current = onMatchOpened;
  }, [onMatchesLoaded, onMatchOpened]);

  useEffect(() => {
    if (!selectedMatchId) {
      const timer = window.setTimeout(() => setMessages([]), 0);

      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void loadMessages(selectedMatchId);
      socketRef.current?.emit("match:join", { matchId: selectedMatchId });
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMatchId || !messageBody.trim()) {
      return;
    }

    const socket = socketRef.current;

    if (!socket?.connected) {
      setNotice("Live messaging is offline. Please wait for the socket to reconnect.");
      return;
    }

    setIsSendingMessage(true);
    setNotice(null);

    socket.emit(
      "direct-message:send",
      {
        matchId: selectedMatchId,
        body: messageBody,
      },
      (response: { ok?: boolean; message?: DirectMessage; error?: string }) => {
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

  if (selectedMatch && viewedMatchProfile) {
    return (
      <MemberProfileView
        candidate={viewedMatchProfile}
        onBack={() => setViewedMatchProfile(null)}
        backLabel="Back to chat"
      />
    );
  }

  if (selectedMatch) {
    return (
      <section className="px-0 md:px-8 md:py-8">
        <article className="mx-auto flex min-h-[calc(100dvh-168px)] max-w-3xl flex-col overflow-hidden bg-white md:min-h-[720px] md:rounded-[28px] md:border md:border-black/[0.05] md:shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3">
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
              onClick={closeMatch}
              aria-label="Back to matches"
              title="Back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] p-1 text-left transition hover:bg-[#fafafa]"
              onClick={() => setViewedMatchProfile(selectedMatch.user)}
              aria-label={`View ${selectedMatch.user.displayName} profile`}
            >
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-[#d4fae8]">
                <CandidatePhoto candidate={selectedMatch.user} variant="thumb" />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold">{selectedMatch.user.displayName}</h1>
                <p className="truncate text-sm text-[#666666]">
                  {[selectedMatch.user.city, selectedMatch.user.state].filter(Boolean).join(", ") || "Nigeria"}
                </p>
              </div>
            </button>

            <div className="inline-flex items-center gap-2 rounded-full bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#666666]">
              <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
              {socketStatus === "connected" ? "Live" : "Connecting"}
            </div>
          </div>

          {notice ? <p className="mx-4 mt-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

          <div className="flex-1 overflow-y-auto bg-[#fafafa] px-4 py-5">
            {isLoadingMessages ? (
              <div className="grid h-full min-h-[360px] place-items-center text-sm font-medium text-[#666666]">
                Loading messages
              </div>
            ) : messages.length > 0 ? (
              <div className="grid gap-3">
                {messages.map((message) => {
                  const isMine = message.senderId === user.id;

                  return (
                    <div key={message.id} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                      {!isMine ? (
                        <button
                          type="button"
                          className="relative size-7 shrink-0 overflow-hidden rounded-full bg-[#d4fae8]"
                          onClick={() => setViewedMatchProfile(selectedMatch.user)}
                          aria-label={`View ${selectedMatch.user.displayName} profile`}
                        >
                          <CandidatePhoto candidate={selectedMatch.user} variant="thumb" />
                        </button>
                      ) : null}
                      <div
                        className={`max-w-[78%] rounded-[20px] px-4 py-3 text-sm leading-6 ${
                          isMine ? "rounded-br-md bg-[#18E299] text-[#0d0d0d]" : "rounded-bl-md bg-white text-[#0d0d0d]"
                        }`}
                      >
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
                  <h2 className="mt-3 text-2xl font-semibold">Start the chat</h2>
                  <p className="mt-2 text-sm text-[#666666]">Send the first message to {selectedMatch.user.displayName}.</p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="flex gap-3 border-t border-black/[0.05] bg-white p-4">
            <input
              className="h-12 min-w-0 flex-1 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              placeholder="Write a message"
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
        </article>
      </section>
    );
  }

  return (
    <section>
      <ScreenHeader
        eyebrow="Matches"
        title="Your conversations."
        action={
          <div className="hidden items-center gap-2 rounded-full border border-black/[0.08] px-4 py-2 text-sm font-medium md:inline-flex">
            <span className={`size-2 rounded-full ${socketStatus === "connected" ? "bg-[#18E299]" : "bg-[#c6c6c6]"}`} />
            {socketStatus === "connected" ? "Live" : "Connecting"}
          </div>
        }
      />

      <div className="px-5 md:px-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingMatches ? (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05]">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading matches</p>
            </div>
          </div>
        ) : matches.length > 0 ? (
          <div className="mx-auto max-w-3xl">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-[#888888]" htmlFor="match-search">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#888888]" aria-hidden="true" />
              <input
                id="match-search"
                className="h-12 w-full rounded-full border border-black/[0.08] pl-11 pr-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                placeholder="Search name, city, interest"
                value={matchSearch}
                onChange={(event) => setMatchSearch(event.target.value)}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              {filteredMatches.length > 0 ? (
                filteredMatches.map((match) => {
                  const activityWeight = matchActivityWeights.get(match.id) ?? 0;

                  return (
                    <button
                      key={match.id}
                      className="flex w-full items-center gap-4 border-b border-black/[0.05] px-4 py-4 text-left transition last:border-b-0 hover:bg-[#fafafa]"
                      onClick={() => openMatch(match.id)}
                    >
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-[#d4fae8] sm:size-20">
                        <CandidatePhoto candidate={match.user} variant="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-lg font-semibold">{match.user.displayName}</p>
                          {activityWeight > 0 ? (
                            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[#18E299] px-1 text-[10px] font-semibold leading-5 text-[#0d0d0d]">
                              {activityWeight > 9 ? "9+" : activityWeight}
                            </span>
                          ) : (
                            <p className="shrink-0 text-xs font-medium text-[#999999]">
                              {new Date(match.lastMessage?.createdAt ?? match.createdAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-[#666666]">{getMatchPreview(match)}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="grid min-h-[260px] place-items-center p-6 text-center">
                  <div>
                    <Search className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
                    <h2 className="mt-3 text-2xl font-semibold">No matches found</h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">Try another name, city, or interest.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05] p-6 text-center">
            <div>
              <MessagesSquare className="mx-auto size-8 text-[#18E299]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">No matches yet</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">
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
