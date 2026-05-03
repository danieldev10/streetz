"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { AppBrand, AppNavButton, MobileHeader, adminTabs, tabs } from "@/components/app/navigation";
import { AdminDashboard } from "@/features/admin/admin-dashboard";
import { DiscoveryTab } from "@/features/discovery/discovery-tab";
import { EventsTab } from "@/features/events/events-tab";
import { MatchesTab } from "@/features/matches/matches-tab";
import { ProfileTab } from "@/features/profile/profile-tab";
import { RoomsTab } from "@/features/rooms/rooms-tab";
import { apiRequest, authHeaders } from "@/lib/api";
import { getMatchActivityWeight, getUnreadMatchActivityCount, markMatchThreadOpened } from "@/lib/match-activity";
import { isProfileReadyForDiscovery } from "@/lib/profile";
import type { MatchThread, ProfileGateState, StreetzProfile, StreetzUser, TabKey } from "@/lib/types";

export function MemberApp({ user, token, onLogout }: { user: StreetzUser; token: string; onLogout: () => void }) {
  const shouldRequireProfileSetup = user.role === "USER";
  const visibleTabs = user.role === "ADMIN" ? adminTabs : tabs;
  const [activeTab, setActiveTab] = useState<TabKey>(user.role === "ADMIN" ? "admin" : "discovery");
  const [profileGateState, setProfileGateState] = useState<ProfileGateState>(
    shouldRequireProfileSetup ? "checking" : "ready"
  );
  const [profileGateNotice, setProfileGateNotice] = useState<string | null>(null);
  const [matchActivityCount, setMatchActivityCount] = useState(0);

  function handleProfileReady() {
    setProfileGateNotice(null);
    setProfileGateState("ready");
    setActiveTab("discovery");
    void refreshMatchActivity({ seedIfNeeded: true });
  }

  async function refreshMatchActivity(options: { seedIfNeeded?: boolean } = {}) {
    const { seedIfNeeded = false } = options;

    try {
      const response = await apiRequest<{ matches: MatchThread[] }>("/matches", {
        headers: authHeaders(token),
      });

      setMatchActivityCount(getUnreadMatchActivityCount(user.id, response.matches, seedIfNeeded));
    } catch {
      // Match activity is decorative; the tab itself will show any fetch errors when opened.
    }
  }

  function handleMatchCreated() {
    setMatchActivityCount((current) => current + 1);
    void refreshMatchActivity({ seedIfNeeded: false });
  }

  function handleMatchesLoaded(matches: MatchThread[]) {
    setMatchActivityCount(getUnreadMatchActivityCount(user.id, matches, true));
  }

  function handleMatchOpened(match: MatchThread) {
    const activityWeight = getMatchActivityWeight(user.id, match);

    markMatchThreadOpened(user.id, match);

    if (activityWeight > 0) {
      setMatchActivityCount((current) => Math.max(0, current - activityWeight));
    }
  }

  useEffect(() => {
    if (!shouldRequireProfileSetup) {
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
          setProfileGateNotice(null);
          setProfileGateState("ready");
          return;
        }

        setActiveTab("profile");
        setProfileGateNotice(null);
        setProfileGateState("required");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setActiveTab("profile");
        setProfileGateNotice(error instanceof Error ? error.message : "Unable to verify your profile setup.");
        setProfileGateState("required");
      }
    }

    void checkProfileGate();

    return () => {
      cancelled = true;
    };
  }, [token, shouldRequireProfileSetup]);

  useEffect(() => {
    if (profileGateState !== "ready") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void refreshMatchActivity({ seedIfNeeded: true });
    }, 0);

    const interval = window.setInterval(() => {
      void refreshMatchActivity({ seedIfNeeded: false });
    }, 30000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user.id, profileGateState]);

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
                  onClick={() => setActiveTab(tab.id)}
                  variant="side"
                  badgeCount={tab.id === "matches" ? matchActivityCount : 0}
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
                <div className="text-center">
                  <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-[#666666]">Checking profile setup</p>
                </div>
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
            <>
              {activeTab === "discovery" ? <DiscoveryTab token={token} onMatchCreated={handleMatchCreated} /> : null}
              {activeTab === "matches" ? (
                <MatchesTab
                  token={token}
                  user={user}
                  onMatchesLoaded={handleMatchesLoaded}
                  onMatchOpened={handleMatchOpened}
                />
              ) : null}
              {activeTab === "profile" ? <ProfileTab token={token} user={user} /> : null}
              {activeTab === "rooms" ? <RoomsTab token={token} user={user} /> : null}
              {activeTab === "events" ? <EventsTab /> : null}
              {activeTab === "admin" && user.role === "ADMIN" ? <AdminDashboard token={token} /> : null}
            </>
          )}
        </section>
      </div>

      {profileGateState === "ready" ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/[0.05] bg-white/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
          <div className={`mx-auto grid max-w-xl gap-1 ${visibleTabs.length === 3 ? "grid-cols-3" : "grid-cols-5"}`}>
            {visibleTabs.map((tab) => (
              <AppNavButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                variant="bottom"
                badgeCount={tab.id === "matches" ? matchActivityCount : 0}
              />
            ))}
          </div>
        </nav>
      ) : null}
    </main>
  );
}
