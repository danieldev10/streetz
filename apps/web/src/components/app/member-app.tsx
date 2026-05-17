"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { LoaderCircle } from "lucide-react";
import { AppBrand, AppNavButton, MobileHeader, adminTabs, tabs } from "@/components/app/navigation";
import { ProfileTab } from "@/features/profile/profile-tab";
import { SOCKET_URL, apiRequest, authHeaders } from "@/lib/api";
import { isProfileReadyForDiscovery } from "@/lib/profile";
import type { ChatRoom, MatchThread, NotificationSummary, ProfileGateState, StreetzProfile, StreetzUser, TabKey } from "@/lib/types";

const readyProfileGateKeys = new Set<string>();

type MemberAppDataCache = {
  matches: MatchThread[];
  rooms: ChatRoom[];
};

const memberAppDataCache = new Map<string, MemberAppDataCache>();

function getMemberAppDataCache(cacheKey: string): MemberAppDataCache {
  return memberAppDataCache.get(cacheKey) ?? { matches: [], rooms: [] };
}

function updateMemberAppDataCache(cacheKey: string, update: Partial<MemberAppDataCache>) {
  const current = getMemberAppDataCache(cacheKey);
  memberAppDataCache.set(cacheKey, { ...current, ...update });
}

export type MemberAppRenderProps = {
  cachedMatches: MatchThread[];
  cachedRooms: ChatRoom[];
  onMatchCreated: () => void;
  onMatchesLoaded: (matches: MatchThread[]) => void;
  onMatchOpened: (match: MatchThread) => void;
  onNotificationsChanged: () => void;
  onRoomsLoaded: (rooms: ChatRoom[]) => void;
  onRoomOpened: (room: ChatRoom) => void;
  refreshNotificationSummary: () => Promise<void>;
};

export function MemberApp({
  user,
  token,
  activeTab,
  onLogout,
  children,
}: {
  user: StreetzUser;
  token: string;
  activeTab: TabKey;
  onLogout: () => void;
  children: (props: MemberAppRenderProps) => ReactNode;
}) {
  const router = useRouter();
  const shouldRequireProfileSetup = user.role === "USER";
  const visibleTabs = user.role === "ADMIN" ? adminTabs : tabs;
  const profileGateKey = `${user.id}:${token}`;
  const [profileGateState, setProfileGateState] = useState<ProfileGateState>(() =>
    shouldRequireProfileSetup && !readyProfileGateKeys.has(profileGateKey) ? "checking" : "ready"
  );
  const [profileGateNotice, setProfileGateNotice] = useState<string | null>(null);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary>({
    matchesUnreadCount: 0,
    roomsUnreadCount: 0,
    totalUnreadCount: 0,
  });
  const [cachedMatches, setCachedMatches] = useState<MatchThread[]>(() => getMemberAppDataCache(profileGateKey).matches);
  const [cachedRooms, setCachedRooms] = useState<ChatRoom[]>(() => getMemberAppDataCache(profileGateKey).rooms);

  const refreshNotificationSummary = useCallback(async () => {
    try {
      const response = await apiRequest<NotificationSummary>("/notifications/summary", {
        headers: authHeaders(token),
      });

      setNotificationSummary(response);
    } catch {
      // Badges are secondary; each tab still owns its visible fetch error state.
    }
  }, [token]);

  function updateNotificationSummary(update: Partial<Omit<NotificationSummary, "totalUnreadCount">>) {
    setNotificationSummary((current) => {
      const next = {
        ...current,
        ...update,
      };

      return {
        ...next,
        totalUnreadCount: next.matchesUnreadCount + next.roomsUnreadCount,
      };
    });
  }

  function getTabBadgeCount(tabId: TabKey) {
    if (tabId === "matches") {
      return notificationSummary.matchesUnreadCount;
    }

    if (tabId === "rooms") {
      return notificationSummary.roomsUnreadCount;
    }

    return 0;
  }

  function handleProfileReady() {
    readyProfileGateKeys.add(profileGateKey);
    setProfileGateNotice(null);
    setProfileGateState("ready");
    router.replace("/discover");
    void refreshNotificationSummary();
  }

  function handleMatchCreated() {
    void refreshNotificationSummary();
  }

  function handleMatchesLoaded(matches: MatchThread[]) {
    updateMemberAppDataCache(profileGateKey, { matches });
    setCachedMatches(matches);
    updateNotificationSummary({
      matchesUnreadCount: matches.reduce((total, match) => total + (match.unreadCount ?? 0), 0),
    });
  }

  function handleMatchOpened(match: MatchThread) {
    const unreadCount = match.unreadCount ?? 0;

    if (unreadCount > 0) {
      setNotificationSummary((current) => {
        const matchesUnreadCount = Math.max(0, current.matchesUnreadCount - unreadCount);

        return {
          ...current,
          matchesUnreadCount,
          totalUnreadCount: matchesUnreadCount + current.roomsUnreadCount,
        };
      });
    }
  }

  function handleRoomsLoaded(rooms: ChatRoom[]) {
    updateMemberAppDataCache(profileGateKey, { rooms });
    setCachedRooms(rooms);
    updateNotificationSummary({
      roomsUnreadCount: rooms.reduce((total, room) => total + (room.hasJoined ? room.unreadCount ?? 0 : 0), 0),
    });
  }

  function handleRoomOpened(room: ChatRoom) {
    const unreadCount = room.unreadCount ?? 0;

    if (unreadCount > 0) {
      setNotificationSummary((current) => {
        const roomsUnreadCount = Math.max(0, current.roomsUnreadCount - unreadCount);

        return {
          ...current,
          roomsUnreadCount,
          totalUnreadCount: current.matchesUnreadCount + roomsUnreadCount,
        };
      });
    }
  }

  useEffect(() => {
    if (!shouldRequireProfileSetup) {
      return undefined;
    }

    if (readyProfileGateKeys.has(profileGateKey)) {
      return undefined;
    }

    let cancelled = false;

    async function checkProfileGate() {
      try {
        const profileResponse = await apiRequest<StreetzProfile | null>("/profiles/me", {
          headers: authHeaders(token),
        });

        if (cancelled) {
          return;
        }

        if (isProfileReadyForDiscovery(profileResponse)) {
          readyProfileGateKeys.add(profileGateKey);
          setProfileGateNotice(null);
          setProfileGateState("ready");
          return;
        }

        if (activeTab !== "profile") {
          router.replace("/profile");
        }

        setProfileGateNotice(null);
        setProfileGateState("required");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (activeTab !== "profile") {
          router.replace("/profile");
        }

        setProfileGateNotice(error instanceof Error ? error.message : "Unable to verify your profile setup.");
        setProfileGateState("required");
      }
    }

    void checkProfileGate();

    return () => {
      cancelled = true;
    };
  }, [activeTab, router, token, shouldRequireProfileSetup, profileGateKey]);

  useEffect(() => {
    if (profileGateState !== "ready") {
      return undefined;
    }

    const timer = window.setTimeout(() => void refreshNotificationSummary(), 0);
    const interval = window.setInterval(() => void refreshNotificationSummary(), 30000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [profileGateState, refreshNotificationSummary]);

  useEffect(() => {
    if (profileGateState !== "ready") {
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("notifications:changed", () => {
      void refreshNotificationSummary();
    });

    return () => {
      socket.disconnect();
    };
  }, [profileGateState, refreshNotificationSummary, token]);

  const renderProps: MemberAppRenderProps = {
    cachedMatches,
    cachedRooms,
    onMatchCreated: handleMatchCreated,
    onMatchesLoaded: handleMatchesLoaded,
    onMatchOpened: handleMatchOpened,
    onNotificationsChanged: refreshNotificationSummary,
    onRoomsLoaded: handleRoomsLoaded,
    onRoomOpened: handleRoomOpened,
    refreshNotificationSummary,
  };

  return (
    <main className="min-h-screen bg-white text-[#0d0d0d]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-black/[0.05] bg-white px-4 py-5 md:block">
          <AppBrand user={user} onLogout={onLogout} />
          {profileGateState === "ready" ? (
            <nav className="mt-8 grid gap-2">
              {visibleTabs.map((tab) => (
                <AppNavButton
                  key={tab.id}
                  tab={tab}
                  active={activeTab === tab.id}
                  variant="side"
                  badgeCount={getTabBadgeCount(tab.id)}
                />
              ))}
            </nav>
          ) : (
            <div className="mt-8 rounded-[18px] bg-[#d4fae8] p-4 text-sm font-medium leading-6 text-[#0b7a50]">
              Complete your profile setup to unlock discovery, matches, rooms, and events.
            </div>
          )}
        </aside>

        <section className={`min-w-0 flex-1 ${profileGateState === "ready" ? "pb-24 md:pb-0" : "pb-8"}`}>
          <MobileHeader user={user} onLogout={onLogout} />
          {profileGateState === "checking" ? (
            <div className="px-5 py-8 md:px-8">
              <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05]">
                <LoaderCircle className="size-7 animate-spin text-[#18E299]" aria-label="Loading" />
              </div>
            </div>
          ) : profileGateState === "required" ? (
            <ProfileTab
              token={token}
              user={user}
              mode="setup"
              setupNotice={profileGateNotice}
              onProfileReady={handleProfileReady}
            />
          ) : (
            children(renderProps)
          )}
        </section>
      </div>

      {profileGateState === "ready" ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/[0.05] bg-white/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-xl gap-1" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
            {visibleTabs.map((tab) => (
              <AppNavButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                variant="bottom"
                badgeCount={getTabBadgeCount(tab.id)}
              />
            ))}
          </div>
        </nav>
      ) : null}
    </main>
  );
}
