"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CenteredShell, PaywallShell } from "@/components/app/auth-shells";
import { MemberApp, type MemberAppRenderProps } from "@/components/app/member-app";
import { TOKEN_KEY, apiRequest, isActiveMember } from "@/lib/api";
import type { StreetzUser, TabKey } from "@/lib/types";

function getDefaultRoute(user: StreetzUser) {
  return user.role === "ADMIN" ? "/admin" : "/discover";
}

function isRouteAllowed(user: StreetzUser, activeTab: TabKey, adminOnly: boolean) {
  if (adminOnly && user.role !== "ADMIN") {
    return false;
  }

  if (user.role === "ADMIN") {
    return activeTab === "admin" || activeTab === "rooms" || activeTab === "events";
  }

  return activeTab !== "admin";
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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StreetzUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEnterApp = useMemo(() => isActiveMember(user), [user]);
  const isAllowed = user ? isRouteAllowed(user, activeTab, adminOnly) : false;

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      router.replace("/");
      window.setTimeout(() => setIsLoadingSession(false), 0);
      return;
    }

    apiRequest<StreetzUser>("/auth/me", {
      headers: {
        Authorization: `Bearer ${savedToken}`,
      },
    })
      .then((sessionUser) => {
        setToken(savedToken);
        setUser(sessionUser);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        router.replace("/");
      })
      .finally(() => setIsLoadingSession(false));
  }, [router]);

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
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.alreadyActive) {
        setUser((current) =>
          current
            ? {
                ...current,
                subscriptionStatus: "ACTIVE",
                subscriptionEndsAt: response.subscriptionEndsAt,
              }
            : current
        );
        return;
      }

      if (!response.authorizationUrl) {
        throw new Error("Paystack did not return a checkout URL.");
      }

      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start payment.");
    } finally {
      setIsStartingPayment(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    router.replace("/");
  }

  if (isLoadingSession) {
    return <CenteredShell title="Streetz" subtitle="Checking your session" />;
  }

  if (!user || !token) {
    return <CenteredShell title="Streetz" subtitle="Opening login" />;
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
    return <CenteredShell title="Streetz" subtitle="Opening your account" />;
  }

  return (
    <MemberApp key={user.id} user={user} token={token} activeTab={activeTab} onLogout={logout}>
      {(appProps) => children({ ...appProps, token, user })}
    </MemberApp>
  );
}
