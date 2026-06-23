"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { CandidatePhoto } from "@/features/discovery/candidate-photo";
import { MemberProfileView } from "@/features/discovery/member-profile-view";
import { SOCKET_URL, apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { formatConnectionStatus } from "@/lib/profile";
import type {
  DiscoveryActionName,
  NotificationFeed,
  NotificationFeedEventAlert,
  NotificationFeedLike,
  NotificationKind,
  PaymentPurpose,
  PaymentStatus,
  ReportStatus,
} from "@/lib/types";

function timeAgo(dateString: string) {
  const seconds = Math.floor((Date.now() - Date.parse(dateString)) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(dateString).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatEventDate(dateString: string) {
  return new Date(dateString).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventLocation(event: { venue: string; city: string; state: string | null }) {
  return [event.venue, event.city, event.state].filter(Boolean).join(", ");
}

function formatNaira(amountKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amountKobo / 100);
}

function formatPaymentPurpose(purpose: PaymentPurpose) {
  if (purpose === "EVENT_TICKET") {
    return "event ticket";
  }

  if (purpose === "MEMBERSHIP_EVENT_TICKET") {
    return "membership + event ticket";
  }

  return "membership";
}

function formatPaymentStatus(status: PaymentStatus) {
  const labels: Record<PaymentStatus, string> = {
    PENDING: "Pending",
    SUCCESS: "Successful",
    FAILED: "Failed",
    ABANDONED: "Abandoned",
    REVERSED: "Reversed",
  };

  return labels[status];
}

function formatReportStatus(status: ReportStatus) {
  const labels: Record<ReportStatus, string> = {
    OPEN: "Open",
    REVIEWED: "Reviewed",
    DISMISSED: "Dismissed",
    ACTIONED: "Actioned",
  };

  return labels[status];
}

function getEventAlertCopy(kind: NotificationFeedEventAlert["kind"]) {
  if (kind === "EVENT_CANCELLED") {
    return {
      icon: AlertTriangle,
      label: "Cancelled",
      title: "Event cancelled",
      description: "If you paid for a ticket, your refund is being processed and we will contact you by email.",
      tone: "bg-[#ff6b6b]/10 text-[#d63f3f]",
    };
  }

  if (kind === "EVENT_UPDATED") {
    return {
      icon: Calendar,
      label: "Updated",
      title: "Event updated",
      description: "Event details changed. Check the event page for the latest information.",
      tone: "bg-[#bd40be]/10 text-[#bd40be]",
    };
  }

  return {
    icon: Clock,
    label: "Reminder",
    title: "Event reminder",
    description: "This event is coming up soon.",
    tone: "bg-[#f5a623]/10 text-[#c98205]",
  };
}

function SectionHeader({ icon: Icon, label, count }: { icon: LucideIcon; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pb-3 pt-1">
      <Icon className="size-4 text-[#888888]" aria-hidden="true" />
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">{label}</h2>
      {count > 0 ? (
        <span className="grid min-w-5 place-items-center rounded-full bg-[#9d2a9e] px-1.5 text-[10px] font-semibold leading-5 text-white">
          {count}
        </span>
      ) : null}
    </div>
  );
}

type FeedSeenItem = {
  kind: NotificationKind;
  entityId: string;
};

type NotificationTabKey = "likes" | "rooms" | "events" | "notifications";

export function NotificationsTab({
  token,
  onMatchCreated,
  onNotificationsChanged,
}: {
  token: string;
  onMatchCreated: () => void;
  onNotificationsChanged: () => void;
}) {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewedLiker, setViewedLiker] = useState<NotificationFeedLike | null>(null);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [activeNotificationTab, setActiveNotificationTab] = useState<NotificationTabKey>("likes");
  const submittedSeenKeysRef = useRef<Set<string>>(new Set());

  const loadFeed = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await apiRequest<NotificationFeed>("/notifications/feed", {
        headers: authHeaders(token),
      });
      setFeed(response);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  async function handleLikeAction(liker: NotificationFeedLike, action: DiscoveryActionName) {
    if (actionTargetId) return;

    setActionTargetId(liker.id);

    try {
      const result = await apiRequest<{ matched: boolean }>("/discovery/actions", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ targetUserId: liker.id, action }),
      });

      setFeed((current) =>
        current ? { ...current, likes: current.likes.filter((candidate) => candidate.id !== liker.id) } : current
      );
      setViewedLiker(null);

      if (result.matched) {
        onMatchCreated();
        setNotice(`You matched with ${liker.displayName}.`);
      }

      onNotificationsChanged();
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setActionTargetId(null);
    }
  }

  const markFeedItemsSeen = useCallback(
    async (currentFeed: NotificationFeed) => {
      const items: FeedSeenItem[] = [
        ...currentFeed.rooms.map((room) => ({
          kind: "ROOM_CREATED" as const,
          entityId: room.id,
        })),
        ...currentFeed.events.map((event) => ({
          kind: "EVENT_PUBLISHED" as const,
          entityId: event.id,
        })),
      ].filter((item) => !submittedSeenKeysRef.current.has(`${item.kind}:${item.entityId}`));

      if (items.length === 0) {
        return;
      }

      try {
        await apiRequest("/notifications/feed/seen", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ items }),
        });

        for (const item of items) {
          submittedSeenKeysRef.current.add(`${item.kind}:${item.entityId}`);
        }

        onNotificationsChanged();
      } catch {

      }
    },
    [onNotificationsChanged, token]
  );

  const markActiveTabSeen = useCallback(
    async (currentFeed: NotificationFeed, tab: NotificationTabKey) => {
      const candidates: FeedSeenItem[] = [];

      if (tab === "likes") {
        for (const match of currentFeed.matches) {
          candidates.push({ kind: "MATCH_CREATED", entityId: match.id });
        }
      }

      if (tab === "events") {
        for (const alert of currentFeed.eventAlerts) {
          candidates.push({ kind: alert.kind, entityId: alert.id });
        }
        for (const ticket of currentFeed.tickets) {
          candidates.push({ kind: "TICKET_CONFIRMED", entityId: ticket.id });
        }
      }

      if (tab === "notifications") {
        for (const alert of currentFeed.subscriptionAlerts) {
          candidates.push({ kind: "SUBSCRIPTION_EXPIRING", entityId: alert.id });
        }
        for (const report of currentFeed.reportUpdates) {
          candidates.push({ kind: "REPORT_STATUS_UPDATED", entityId: report.id });
        }
        for (const payment of currentFeed.paymentAlerts) {
          candidates.push({ kind: payment.kind, entityId: payment.id });
        }
      }

      const unseen = candidates.filter(
        (item) => !submittedSeenKeysRef.current.has(`${item.kind}:${item.entityId}`)
      );

      if (unseen.length === 0) return;

      try {
        await apiRequest("/notifications/feed/seen", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ items: unseen }),
        });

        for (const item of unseen) {
          submittedSeenKeysRef.current.add(`${item.kind}:${item.entityId}`);
        }

        onNotificationsChanged();
      } catch {

      }
    },
    [onNotificationsChanged, token]
  );

  const markFeedItemSeen = useCallback(
    async (item: FeedSeenItem) => {
      const key = `${item.kind}:${item.entityId}`;

      if (submittedSeenKeysRef.current.has(key)) {
        return;
      }

      try {
        await apiRequest("/notifications/feed/seen", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ items: [item] }),
        });
        submittedSeenKeysRef.current.add(key);
        onNotificationsChanged();
      } catch {
        // the next feed refresh will reconcile the seen state & update badges??
      }
    },
    [onNotificationsChanged, token]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFeed();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadFeed]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("notifications:changed", () => {
      void loadFeed();
    });

    return () => {
      socket.disconnect();
    };
  }, [loadFeed, token]);

  useEffect(() => {
    if (!feed) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void markFeedItemsSeen(feed);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [feed, markFeedItemsSeen]);

  useEffect(() => {
    if (!feed) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void markActiveTabSeen(feed, activeNotificationTab);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [feed, activeNotificationTab, markActiveTabSeen]);

  if (viewedLiker) {
    return (
      <MemberProfileView
        candidate={viewedLiker}
        onBack={() => setViewedLiker(null)}
        backLabel="Back to notifications"
        token={token}
        showSafetyActions
        onBlocked={(candidate) => {
          setFeed((current) =>
            current ? { ...current, likes: current.likes.filter((liker) => liker.id !== candidate.id) } : current
          );
          setViewedLiker(null);
          setNotice("Profile blocked.");
          onNotificationsChanged();
        }}
        footer={
          <div className="flex gap-3 border-t border-black/5 bg-white p-4">
            <button
              type="button"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-black/8 text-sm font-medium text-[#666666] transition hover:bg-[#fafafa] disabled:opacity-60"
              onClick={() => handleLikeAction(viewedLiker, "PASS")}
              disabled={actionTargetId === viewedLiker.id}
            >
              <X className="size-4" aria-hidden="true" />
              Pass
            </button>
            <button
              type="button"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#9d2a9e] text-sm font-medium text-white transition hover:bg-[#7c1f7d] disabled:opacity-60"
              onClick={() => handleLikeAction(viewedLiker, "LIKE")}
              disabled={actionTargetId === viewedLiker.id}
            >
              {actionTargetId === viewedLiker.id ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Heart className="size-4" aria-hidden="true" />
              )}
              Like back
            </button>
          </div>
        }
      />
    );
  }

  const tabCounts: Record<NotificationTabKey, number> = feed
    ? {
      likes: feed.likes.length + feed.matches.filter((m) => !m.seen).length + feed.directMessages.length,
      rooms: feed.roomMessages.length + feed.rooms.length,
      events: feed.eventAlerts.length + feed.tickets.length + feed.events.length,
      notifications: feed.subscriptionAlerts.length + feed.reportUpdates.length + feed.paymentAlerts.length,
    }
    : {
      likes: 0,
      rooms: 0,
      events: 0,
      notifications: 0,
    };
  const tabHasContent: Record<NotificationTabKey, boolean> = feed
    ? {
      likes: feed.likes.length > 0 || feed.matches.length > 0 || feed.directMessages.length > 0,
      rooms: feed.roomMessages.length > 0 || feed.rooms.length > 0,
      events: feed.eventAlerts.length > 0 || feed.tickets.length > 0 || feed.events.length > 0,
      notifications: feed.subscriptionAlerts.length > 0 || feed.reportUpdates.length > 0 || feed.paymentAlerts.length > 0,
    }
    : { likes: false, rooms: false, events: false, notifications: false };
  const notificationTabs: Array<{ id: NotificationTabKey; label: string; count: number }> = [
    { id: "likes", label: "Likes", count: tabCounts.likes },
    { id: "rooms", label: "Rooms", count: tabCounts.rooms },
    { id: "events", label: "Events", count: tabCounts.events },
    { id: "notifications", label: "Notifications", count: tabCounts.notifications },
  ];
  const emptyTabCopy: Record<NotificationTabKey, string> = {
    likes: "No likes, matches, or direct messages right now.",
    rooms: "No room activity or new rooms right now.",
    events: "No event alerts, tickets, or upcoming events right now.",
    notifications: "No membership, payment, or report updates right now.",
  };
  const hasSomeContent = feed ? Object.values(tabHasContent).some(Boolean) : false;

  return (
    <section>
      <ScreenHeader
        eyebrow="Alerts"
        title=""
        action={
          <button
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 text-[#666666] transition hover:text-[#0d0d0d]"
            onClick={() => void loadFeed()}
            disabled={isLoading}
            aria-label="Refresh notifications"
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        }
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? (
          <p className="mb-4 rounded-2xl bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p>
        ) : null}

        {isLoading && !feed ? (
          <LoadingState label="Loading notifications" className="min-h-105 rounded-[28px] border border-black/5" />
        ) : feed && !hasSomeContent ? (
          <div className="grid min-h-105 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
            <div>
              <Bell className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold">Nothing new</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">
                Likes, matches, messages, rooms, events, tickets, payments, and report updates will appear here.
              </p>
            </div>
          </div>
        ) : feed ? (
          <div className="mx-auto max-w-3xl">
            <div className="mb-5">
              <div className="grid grid-cols-4 gap-1 rounded-full bg-black/4 p-1.5">
                {notificationTabs.map((tab) => {
                  const isActive = activeNotificationTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`whitespace-nowrap rounded-full px-1 py-2 text-[10px] font-medium leading-5 transition sm:px-2 sm:text-[12px] ${isActive
                        ? "bg-[#0d0d0d] text-white shadow-[0_8px_18px_rgba(0,0,0,0.12)]"
                        : "text-[#666666] hover:text-[#0d0d0d]"
                        }`}
                      onClick={() => setActiveNotificationTab(tab.id)}
                    >
                      {tab.label}
                      {tab.count > 0 ? (
                        <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[#9d2a9e] px-1 text-[10px] font-semibold leading-4 text-white shadow-[0_0_0_1px_rgba(13,13,13,0.05)] sm:min-w-5 sm:px-1.5 sm:text-[11px] sm:leading-5">
                          {tab.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {!tabHasContent[activeNotificationTab] ? (
              <div className="grid min-h-80 place-items-center rounded-[28px] border border-black/5 p-6 text-center">
                <div>
                  <Bell className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
                  <h2 className="mt-3 text-2xl font-semibold">Nothing here</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#666666]">{emptyTabCopy[activeNotificationTab]}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {activeNotificationTab === "likes" && feed.likes.length > 0 ? (
                  <div>
                    <SectionHeader icon={Heart} label="Likes" count={feed.likes.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.likes.map((liker) => (
                        <button
                          key={liker.id}
                          type="button"
                          className="group flex items-center gap-4 rounded-[20px] border border-black/5 bg-white p-3 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => setViewedLiker(liker)}
                        >
                          <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-[#f6e0f6]">
                            <CandidatePhoto candidate={liker} variant="thumb" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-[#0d0d0d]">
                                {liker.displayName}{liker.age ? `, ${liker.age}` : ""}
                              </p>
                              <Heart className="size-4 shrink-0 fill-[#ff6b8a] text-[#ff6b8a]" aria-hidden="true" />
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#666666]">
                              {[liker.city, liker.state].filter(Boolean).join(", ") || "Nigeria"}
                              {liker.connectionStatus ? ` · ${formatConnectionStatus(liker.connectionStatus)}` : ""}
                            </p>
                            {liker.likedAt ? (
                              <p className="mt-1 text-[11px] text-[#999999]">{timeAgo(liker.likedAt)}</p>
                            ) : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "likes" && feed.matches.length > 0 ? (
                  <div>
                    <SectionHeader icon={Users} label="New matches" count={feed.matches.filter((m) => !m.seen).length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[...feed.matches]
                        .sort((a, b) => {
                          if (a.seen !== b.seen) return a.seen ? 1 : -1;
                          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
                        })
                        .map((match) => (
                          <button
                            key={match.id}
                            type="button"
                            className={`flex items-center gap-4 rounded-[20px] border bg-white p-3 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition ${
                              match.seen
                                ? "border-black/[0.03] opacity-50"
                                : "border-black/5 hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                            }`}
                            onClick={() => {
                              if (!match.seen) {
                                void markFeedItemSeen({ kind: "MATCH_CREATED", entityId: match.id });
                              }
                              router.push(`/matches/${match.id}`);
                            }}
                          >
                            <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-[#f6e0f6]">
                              <CandidatePhoto candidate={match.user} variant="thumb" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-[#0d0d0d]">{match.user.displayName}</p>
                                {match.seen
                                  ? <CheckCircle2 className="size-4 shrink-0 text-[#bd40be]" aria-hidden="true" />
                                  : <Heart className="size-4 shrink-0 fill-[#ff6b8a] text-[#ff6b8a]" aria-hidden="true" />
                                }
                              </div>
                              <p className="mt-0.5 truncate text-xs text-[#666666]">
                                {match.seen ? "Match" : "New match"}
                                {match.user.city ? ` · ${match.user.city}` : ""}
                              </p>
                              <p className="mt-1 text-[11px] text-[#999999]">{timeAgo(match.createdAt)}</p>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "likes" && feed.directMessages.length > 0 ? (
                  <div>
                    <SectionHeader icon={MessageCircle} label="Direct messages" count={feed.directMessages.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.directMessages.map((message) => (
                        <button
                          key={message.id}
                          type="button"
                          className="group flex items-center gap-4 rounded-[20px] border border-black/5 bg-white p-3 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => router.push(`/matches/${message.matchId}`)}
                        >
                          <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-[#f6e0f6]">
                            <CandidatePhoto candidate={message.user} variant="thumb" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-[#0d0d0d]">{message.user.displayName}</p>
                              <span className="grid min-w-5 place-items-center rounded-full bg-[#9d2a9e] px-1.5 text-[10px] font-semibold leading-5 text-white">
                                {message.unreadCount}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#666666]">
                              {message.lastMessage.senderName}: {message.lastMessage.body}
                            </p>
                            <p className="mt-1 text-[11px] text-[#999999]">{timeAgo(message.updatedAt)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "rooms" && feed.roomMessages.length > 0 ? (
                  <div>
                    <SectionHeader icon={MessageCircle} label="Room activity" count={feed.roomMessages.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.roomMessages.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => router.push(`/rooms/${room.roomId}`)}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#bd40be]/10">
                            <MessageCircle className="size-5 text-[#9d2a9e]" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-[#0d0d0d]">{room.name}</p>
                              <span className="grid min-w-5 place-items-center rounded-full bg-[#9d2a9e] px-1.5 text-[10px] font-semibold leading-5 text-white">
                                {room.unreadCount}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#666666]">{room.category}</p>
                            <p className="mt-1 truncate text-[11px] text-[#999999]">
                              {room.lastMessage.authorName}: {room.lastMessage.body}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "events" && feed.eventAlerts.length > 0 ? (
                  <div>
                    <SectionHeader icon={AlertTriangle} label="Event alerts" count={feed.eventAlerts.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.eventAlerts.map((alert) => {
                        const copy = getEventAlertCopy(alert.kind);
                        const Icon = copy.icon;

                        return (
                          <button
                            key={`${alert.kind}:${alert.id}`}
                            type="button"
                            className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                            onClick={() => {
                              void markFeedItemSeen({ kind: alert.kind, entityId: alert.id });
                              router.push("/events");
                            }}
                          >
                            <div className={`grid size-11 shrink-0 place-items-center rounded-full ${copy.tone}`}>
                              <Icon className="size-5" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-[#0d0d0d]">{copy.title}</p>
                                <span className="rounded-full bg-black/4 px-2 py-0.5 text-[10px] font-semibold text-[#666666]">
                                  {copy.label}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-[#666666]">{alert.title}</p>
                              <p className="mt-1 text-xs leading-5 text-[#666666]">{copy.description}</p>
                              {alert.kind === "EVENT_CANCELLED" && alert.cancellationReason ? (
                                <p className="mt-1 text-xs leading-5 text-[#999999]">{alert.cancellationReason}</p>
                              ) : null}
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[#999999]">
                                <Calendar className="size-3" aria-hidden="true" />
                                {formatEventDate(alert.startsAt)}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "events" && feed.tickets.length > 0 ? (
                  <div>
                    <SectionHeader icon={CheckCircle2} label="Tickets" count={feed.tickets.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.tickets.map((ticket) => (
                        <button
                          key={ticket.id}
                          type="button"
                          className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => {
                            void markFeedItemSeen({ kind: "TICKET_CONFIRMED", entityId: ticket.id });
                            router.push("/events");
                          }}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#bd40be]/10">
                            <CheckCircle2 className="size-5 text-[#9d2a9e]" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#0d0d0d]">Ticket confirmed</p>
                            <p className="mt-0.5 truncate text-xs text-[#666666]">{ticket.event.title}</p>
                            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[#999999]">
                              <Calendar className="size-3" aria-hidden="true" />
                              {formatEventDate(ticket.event.startsAt)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "rooms" && feed.rooms.length > 0 ? (
                  <div>
                    <SectionHeader icon={MessageCircle} label="New rooms" count={feed.rooms.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.rooms.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => router.push("/rooms")}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#bd40be]/10">
                            <MessageCircle className="size-5 text-[#bd40be]" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#0d0d0d]">{room.name}</p>
                            <p className="mt-0.5 truncate text-xs text-[#666666]">{room.category}</p>
                            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[#999999]">
                              <span className="inline-flex items-center gap-1">
                                <Users className="size-3" aria-hidden="true" />
                                {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
                              </span>
                              <span>{timeAgo(room.createdAt)}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "events" && feed.events.length > 0 ? (
                  <div>
                    <SectionHeader icon={Ticket} label="Upcoming events" count={feed.events.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.events.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => router.push("/events")}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f5a623]/10">
                            <Ticket className="size-5 text-[#f5a623]" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#0d0d0d]">{event.title}</p>
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-[#666666]">
                              <MapPin className="size-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{formatEventLocation(event)}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[#999999]">
                              <Calendar className="size-3" aria-hidden="true" />
                              {formatEventDate(event.startsAt)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "notifications" && feed.subscriptionAlerts.length > 0 ? (
                  <div>
                    <SectionHeader icon={Clock} label="Membership" count={feed.subscriptionAlerts.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.subscriptionAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => {
                            void markFeedItemSeen({ kind: "SUBSCRIPTION_EXPIRING", entityId: alert.id });
                            router.push("/profile");
                          }}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f5a623]/10">
                            <Clock className="size-5 text-[#c98205]" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#0d0d0d]">Membership expiring soon</p>
                            <p className="mt-0.5 truncate text-xs text-[#666666]">
                              Renews or expires on {formatEventDate(alert.subscriptionEndsAt)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "notifications" && feed.reportUpdates.length > 0 ? (
                  <div>
                    <SectionHeader icon={ShieldCheck} label="Reports" count={feed.reportUpdates.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.reportUpdates.map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                          onClick={() => {
                            void markFeedItemSeen({ kind: "REPORT_STATUS_UPDATED", entityId: report.id });
                            router.push("/reports");
                          }}
                        >
                          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#bd40be]/10">
                            <ShieldCheck className="size-5 text-[#bd40be]" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#0d0d0d]">Report {formatReportStatus(report.status)}</p>
                            <p className="mt-0.5 truncate text-xs text-[#666666]">{report.reason}</p>
                            <p className="mt-1 text-[11px] text-[#999999]">{timeAgo(report.updatedAt)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeNotificationTab === "notifications" && feed.paymentAlerts.length > 0 ? (
                  <div>
                    <SectionHeader icon={CreditCard} label="Payments" count={feed.paymentAlerts.length} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {feed.paymentAlerts.map((payment) => {
                        const isSuccess = payment.kind === "SUBSCRIPTION_PAYMENT_SUCCESS";

                        return (
                          <button
                            key={`${payment.kind}:${payment.id}`}
                            type="button"
                            className="group flex items-start gap-4 rounded-[20px] border border-black/5 bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:border-[#bd40be]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                            onClick={() => {
                              void markFeedItemSeen({ kind: payment.kind, entityId: payment.id });
                              router.push(payment.purpose === "EVENT_TICKET" ? "/events" : "/profile");
                            }}
                          >
                            <div className={`grid size-11 shrink-0 place-items-center rounded-full ${isSuccess ? "bg-[#bd40be]/10" : "bg-[#ff6b6b]/10"}`}>
                              <CreditCard className={`size-5 ${isSuccess ? "text-[#9d2a9e]" : "text-[#d63f3f]"}`} aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-[#0d0d0d]">
                                {formatPaymentStatus(payment.status)} {formatPaymentPurpose(payment.purpose)} payment
                              </p>
                              <p className="mt-0.5 truncate text-xs text-[#666666]">{formatNaira(payment.amountKobo)}</p>
                              <p className="mt-1 text-[11px] text-[#999999]">{timeAgo(payment.updatedAt)}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
