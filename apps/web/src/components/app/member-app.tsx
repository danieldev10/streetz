"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { io } from "socket.io-client";
import { AppBrand, AppNavButton, MobileHeader, adminTabs, bottomTabs, tabs } from "@/components/app/navigation";
import { SOCKET_URL, apiRequest, authHeaders } from "@/lib/api";
import type { ChatRoom, MatchThread, NotificationSummary, ProfilePhoto, StreetzProfile, StreetzUser, TabKey } from "@/lib/types";

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
  const pathname = usePathname();
  const visibleTabs = user.role === "ADMIN" ? adminTabs : tabs;
  const visibleBottomTabs = user.role === "ADMIN" ? adminTabs : bottomTabs;
  const cacheKey = `${user.id}:${token}`;
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary>({
    matchesUnreadCount: 0,
    roomsUnreadCount: 0,
    notificationsUnreadCount: 0,
    totalUnreadCount: 0,
  });
  const [cachedMatches, setCachedMatches] = useState<MatchThread[]>(() => getMemberAppDataCache(cacheKey).matches);
  const [cachedRooms, setCachedRooms] = useState<ChatRoom[]>(() => getMemberAppDataCache(cacheKey).rooms);
  const [profilePhoto, setProfilePhoto] = useState<ProfilePhoto | undefined>(undefined);

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
        totalUnreadCount: next.matchesUnreadCount + next.roomsUnreadCount + next.notificationsUnreadCount,
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

    if (tabId === "notifications") {
      return notificationSummary.notificationsUnreadCount;
    }

    return 0;
  }

  function handleMatchCreated() {
    void refreshNotificationSummary();
  }

  function handleMatchesLoaded(matches: MatchThread[]) {
    updateMemberAppDataCache(cacheKey, { matches });
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
          totalUnreadCount: matchesUnreadCount + current.roomsUnreadCount + current.notificationsUnreadCount,
        };
      });
    }
  }

  function handleRoomsLoaded(rooms: ChatRoom[]) {
    updateMemberAppDataCache(cacheKey, { rooms });
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
          totalUnreadCount: current.matchesUnreadCount + roomsUnreadCount + current.notificationsUnreadCount,
        };
      });
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshNotificationSummary(), 0);
    const interval = window.setInterval(() => void refreshNotificationSummary(), 30000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refreshNotificationSummary]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfilePhoto() {
      try {
        const profile = await apiRequest<StreetzProfile>("/profiles/me", {
          headers: authHeaders(token),
        });

        if (!cancelled) {
          setProfilePhoto(profile.user.photos[0]);
        }
      } catch {
        if (!cancelled) {
          setProfilePhoto(undefined);
        }
      }
    }

    void loadProfilePhoto();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("notifications:changed", () => {
      void refreshNotificationSummary();
    });

    return () => {
      socket.disconnect();
    };
  }, [refreshNotificationSummary, token]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab, pathname]);

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
        </aside>

        <section className="min-w-0 flex-1 pb-24 md:pb-0">
          <MobileHeader user={user} profilePhoto={profilePhoto} onLogout={onLogout} />
          {children(renderProps)}
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/[0.05] bg-white/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl gap-1" style={{ gridTemplateColumns: `repeat(${visibleBottomTabs.length}, minmax(0, 1fr))` }}>
          {visibleBottomTabs.map((tab) => (
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
    </main>
  );
}
