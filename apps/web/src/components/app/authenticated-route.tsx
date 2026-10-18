"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountStatusShell, PaywallShell } from "@/components/app/auth-shells";
import { MemberApp, type MemberAppRenderProps } from "@/components/app/member-app";
import { CardGridSkeleton } from "@/components/card-grid-skeleton";
import { ListSkeleton, StatGridSkeleton } from "@/components/skeletons";
import { DiscoveryLoadingView } from "@/features/discovery/discovery-loading-view";
import { useSession } from "@/components/app/session-provider";
import { appContentClassName, appFrameClassName, appSidebarClassName, DesktopHeader } from "@/components/app/desktop-layout";
import { apiRequest, authHeaders, getUserErrorMessage, isActiveMember } from "@/lib/api";
import type { StreetzUser, TabKey } from "@/lib/types";

function getDefaultRoute(user: StreetzUser) {
  return user.role === "ADMIN" ? "/admin" : "/events";
}

function isRouteAllowed(user: StreetzUser, activeTab: TabKey, adminOnly: boolean) {
  if (adminOnly && user.role !== "ADMIN") {
    return false;
  }

  if (user.role === "ADMIN") {
    return activeTab === "admin" || activeTab === "reports" || activeTab === "events" || activeTab === "users" || activeTab === "support";
  }

  return activeTab !== "admin" && activeTab !== "reports" && activeTab !== "users";
}

/** Stands in for the tab that is about to render, so the shell hands over without a jump. */
function TabContentSkeleton({ activeTab }: { activeTab: TabKey }) {
  // Discovery sits behind a profile gate, so it shares its loading view with
  // that gate and the tab itself to keep one continuous skeleton.
  if (activeTab === "discovery") {
    return <DiscoveryLoadingView />;
  }

  return (
    <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
      {activeTab === "events" ? (
        <CardGridSkeleton label="Loading events" />
      ) : activeTab === "admin" ? (
        <StatGridSkeleton label="Loading metrics" />
      ) : (
        <ListSkeleton label="Loading" hasAction={false} />
      )}
    </div>
  );
}

function LoadingShell({ activeTab }: { activeTab: TabKey }) {
  return (
    <main className="min-h-screen bg-surface text-ink md:bg-surface-sunken">
      <div className={appFrameClassName}>
        <aside className={appSidebarClassName}>
          <div className="animate-pulse" aria-hidden="true">
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="size-11 rounded-2xl bg-black/5" />
              <div className="h-7 w-24 rounded-full bg-black/5" />
            </div>
            <div className="mt-8 grid gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-12 rounded-2xl bg-black/[0.04]" />
              ))}
            </div>
          </div>
        </aside>

        <section className={appContentClassName}>
          <DesktopHeader activeTab={activeTab}>
            <div className="h-12 w-36 animate-pulse rounded-full bg-black/5" aria-hidden="true" />
          </DesktopHeader>
          <div className="sticky top-0 z-10 border-b border-black/[0.05] bg-surface/90 px-5 py-4 backdrop-blur md:hidden">
            <div className="grid grid-cols-[44px_1fr_44px] items-center" aria-hidden="true">
              <div className="size-11 animate-pulse rounded-full bg-black/5" />
              <div className="justify-self-center">
                <div className="size-14 animate-pulse rounded-2xl bg-black/5" />
              </div>
              <span className="size-11" />
            </div>
          </div>
          <TabContentSkeleton activeTab={activeTab} />
        </section>
      </div>
    </main>
  );
}

export function AuthenticatedRoute({
  activeTab,
  adminOnly = false,
  children,
}: {
  activeTab: TabKey;
  adminOnly?: boolean;
  children: (props: MemberAppRenderProps & { token: string; user: StreetzUser }) => ReactNode;
}) {
  const router = useRouter();
  const { status, token, user, updateSessionUser, logout } = useSession();
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEnterApp = useMemo(() => isActiveMember(user), [user]);
  const isAllowed = user ? isRouteAllowed(user, activeTab, adminOnly) : false;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/?mode=login");
    }
  }, [router, status]);

  useEffect(() => {
    if (!user || !canEnterApp || isAllowed) {
      return;
    }

    router.replace(getDefaultRoute(user));
  }, [canEnterApp, isAllowed, router, user]);

  async function startSubscription() {
    if (!token) {
      setMessage("Please log in again before paying.");
      return;
    }

    setIsStartingPayment(true);
    setMessage(null);

    try {
      const response = await apiRequest<{
        authorizationUrl?: string;
        alreadyActive?: boolean;
        subscriptionEndsAt?: string;
      }>("/payments/subscription/initialize", {
        method: "POST",
        headers: authHeaders(token),
      });

      if (response.alreadyActive) {
        updateSessionUser((current) => ({
          ...current,
          subscriptionStatus: "ACTIVE" as const,
          subscriptionEndsAt: response.subscriptionEndsAt,
        }));
        return;
      }

      if (!response.authorizationUrl) {
        throw new Error("Paystack did not return a checkout URL.");
      }

      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setMessage(getUserErrorMessage(error));
    } finally {
      setIsStartingPayment(false);
    }
  }

  async function reactivateAccount() {
    if (!token) {
      setMessage("Please log in again.");
      return;
    }

    setIsSubmittingAccount(true);
    setMessage(null);

    try {
      const nextUser = await apiRequest<StreetzUser>("/auth/account/reactivate", {
        method: "POST",
        headers: authHeaders(token),
      });

      updateSessionUser(() => nextUser);
    } catch (error) {
      setMessage(getUserErrorMessage(error));
    } finally {
      setIsSubmittingAccount(false);
    }
  }

  if (status === "checking") {
    return <LoadingShell activeTab={activeTab} />;
  }

  if (!user || !token) {
    return <LoadingShell activeTab={activeTab} />;
  }

  if (user.accountStatus !== "ACTIVE") {
    return (
      <AccountStatusShell
        user={user}
        message={message}
        isSubmitting={isSubmittingAccount}
        onReactivate={() => void reactivateAccount()}
        onLogout={logout}
      />
    );
  }

  if (!canEnterApp) {
    return (
      <PaywallShell
        user={user}
        message={message}
        isStartingPayment={isStartingPayment}
        onStartSubscription={startSubscription}
        onLogout={logout}
      />
    );
  }

  if (!isAllowed) {
    return <LoadingShell activeTab={activeTab} />;
  }

  return (
    <MemberApp key={user.id} user={user} token={token} activeTab={activeTab} onLogout={logout}>
      {(appProps) => children({ ...appProps, token, user })}
    </MemberApp>
  );
}
