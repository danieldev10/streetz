"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountStatusShell, PaywallShell } from "@/components/app/auth-shells";
import { MemberApp, type MemberAppRenderProps } from "@/components/app/member-app";
import { LoadingState } from "@/components/loading-state";
import { useSession } from "@/components/app/session-provider";
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
    return activeTab === "admin" || activeTab === "reports" || activeTab === "rooms" || activeTab === "events" || activeTab === "users";
  }

  return activeTab !== "admin" && activeTab !== "reports" && activeTab !== "users";
}

function LoadingShell() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-[#0d0d0d]">
      <LoadingState label="Loading" />
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
      router.replace("/");
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
    return <LoadingShell />;
  }

  if (!user || !token) {
    return <LoadingShell />;
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
    return <LoadingShell />;
  }

  return (
    <MemberApp key={user.id} user={user} token={token} activeTab={activeTab} onLogout={logout}>
      {(appProps) => children({ ...appProps, token, user })}
    </MemberApp>
  );
}
