"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { AccountStatusShell, AuthShell, CenteredShell, PaywallShell } from "@/components/app/auth-shells";
import { useSession } from "@/components/app/session-provider";
import { apiRequest, authHeaders, getUserErrorMessage, isActiveMember } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth-constraints";
import type { AuthResponse, StreetzUser } from "@/lib/types";

function getDefaultRoute(user: StreetzUser) {
  return user.role === "ADMIN" ? "/admin" : "/events";
}

function getAuthValidationMessage(options: {
  authMode: "login" | "register";
  displayName: string;
  email: string;
  password: string;
}) {
  const email = options.email.trim();

  if (options.authMode === "register") {
    const displayName = options.displayName.trim();

    if (displayName.length < 2) {
      return "Display name must be at least 2 characters.";
    }

    if (displayName.length > 80) {
      return "Display name must be 80 characters or fewer.";
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }

  if (options.password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (options.password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  return null;
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
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEnterApp = useMemo(() => isActiveMember(user), [user]);

  useEffect(() => {
    if (status === "authenticated" && user && canEnterApp) {
      router.replace(getDefaultRoute(user));
    }
  }, [canEnterApp, router, status, user]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const validationMessage = getAuthValidationMessage({ authMode, displayName, email, password });

    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setIsSubmittingAuth(true);

    try {
      const payload = authMode === "register"
        ? { displayName: displayName.trim(), email: email.trim(), password }
        : { email: email.trim(), password };
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

  async function deleteAccount(password: string) {
    if (!token) {
      setMessage("Please log in again.");
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setMessage("Enter your password to delete your account.");
      return;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      setMessage(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setIsSubmittingAccount(true);
    setMessage(null);

    try {
      await apiRequest<{ deleted: boolean }>("/auth/account/delete", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ password }),
      });
      logout();
    } catch (error) {
      setMessage(getUserErrorMessage(error));
    } finally {
      setIsSubmittingAccount(false);
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

  return <CenteredShell title="crushclub" subtitle="Opening your account" />;
}
