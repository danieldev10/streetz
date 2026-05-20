"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { AuthShell, CenteredShell, PaywallShell } from "@/components/app/auth-shells";
import { useSession } from "@/components/app/session-provider";
import { apiRequest, authHeaders, getUserErrorMessage, isActiveMember } from "@/lib/api";
import type { AuthResponse, StreetzUser } from "@/lib/types";

function getDefaultRoute(user: StreetzUser) {
  return user.role === "ADMIN" ? "/admin" : "/discover";
}

function LoadingShell() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-[#0d0d0d]">
      <LoaderCircle className="size-7 animate-spin text-[#18E299]" aria-label="Loading" />
    </main>
  );
}

export default function Home() {
  const router = useRouter();
  const { status, token, user, setSession, updateSessionUser, logout: clearSession } = useSession();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEnterApp = useMemo(() => isActiveMember(user), [user]);

  useEffect(() => {
    if (status === "authenticated" && user && canEnterApp) {
      router.replace(getDefaultRoute(user));
    }
  }, [canEnterApp, router, status, user]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingAuth(true);
    setMessage(null);

    try {
      const payload = authMode === "register" ? { displayName, email, password } : { email, password };
      const auth = await apiRequest<AuthResponse>(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSession(auth.accessToken, auth.user);
      setPassword("");

      if (isActiveMember(auth.user)) {
        router.replace(getDefaultRoute(auth.user));
      }
    } catch (error) {
      setMessage(getUserErrorMessage(error));
    } finally {
      setIsSubmittingAuth(false);
    }
  }

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
          subscriptionStatus: "ACTIVE",
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

  function logout() {
    clearSession({ redirect: false });
    setAuthMode("login");
  }

  if (status === "checking") {
    return <LoadingShell />;
  }

  if (!user) {
    return (
      <AuthShell
        authMode={authMode}
        displayName={displayName}
        email={email}
        password={password}
        message={message}
        isSubmitting={isSubmittingAuth}
        onModeChange={setAuthMode}
        onDisplayNameChange={setDisplayName}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleAuthSubmit}
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

  return <CenteredShell title="crushclub" subtitle="Opening your account" />;
}
