"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AuthShell, CenteredShell, PaywallShell } from "@/components/app/auth-shells";
import { MemberApp } from "@/components/app/member-app";
import { TOKEN_KEY, apiRequest, isActiveMember } from "@/lib/api";
import type { AuthResponse, StreetzUser } from "@/lib/types";

export default function Home() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StreetzUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEnterApp = useMemo(() => isActiveMember(user), [user]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
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
      })
      .finally(() => setIsLoadingSession(false));
  }, []);

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

      window.localStorage.setItem(TOKEN_KEY, auth.accessToken);
      setToken(auth.accessToken);
      setUser(auth.user);
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to continue.");
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
    setAuthMode("login");
  }

  if (isLoadingSession) {
    return <CenteredShell title="Streetz" subtitle="Checking your session" />;
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

  return <MemberApp key={user.id} user={user} token={token ?? ""} onLogout={logout} />;
}
