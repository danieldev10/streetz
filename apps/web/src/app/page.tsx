"use client";

import type { FormEvent } from "react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountStatusShell, AuthShell, PaywallShell } from "@/components/app/auth-shells";
import { LoadingState } from "@/components/loading-state";
import { useSession } from "@/components/app/session-provider";
import { apiRequest, authHeaders, getUserErrorMessage, isActiveMember } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth-constraints";
import {
  clearPendingEventCheckout,
  getPendingEventCheckout,
  savePendingEventCheckoutNotice,
  type PendingEventCheckout,
} from "@/lib/pending-event-checkout";
import type { AuthResponse, StreetzEvent, StreetzUser } from "@/lib/types";

function getDefaultRoute(user: StreetzUser) {
  return user.role === "ADMIN" ? "/admin" : "/events";
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function getAuthValidationMessage(options: {
  authMode: "login" | "register";
  displayName: string;
  email: string;
  password: string;
  ageConfirmed: boolean;
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

    if (!options.ageConfirmed) {
      return "Confirm that you are 18 or older to create an account.";
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

const MEMBERSHIP_AMOUNT_KOBO = 100_000;

type CheckoutPreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  event: StreetzEvent | null;
  message?: string;
};

function formatNaira(amountKobo: number) {
  if (amountKobo <= 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amountKobo / 100);
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeTicketTierName(name: string) {
  return name === "General Admission" ? "Regular" : name;
}

function getEventTicketTypes(event: StreetzEvent) {
  return event.ticketTypes?.length ? event.ticketTypes : event.ticketType ? [event.ticketType] : [];
}

function getPendingCheckoutTicketType(event: StreetzEvent, checkout: PendingEventCheckout) {
  const ticketTypes = getEventTicketTypes(event);

  return ticketTypes.find((ticketType) => ticketType.id === checkout.ticketTypeId) ?? ticketTypes[0] ?? null;
}

function CheckoutRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[#666666]">{label}</span>
      <span className={`text-right ${strong ? "text-base font-semibold text-[#0d0d0d]" : "font-medium text-[#0d0d0d]"}`}>{value}</span>
    </div>
  );
}

function PendingEventCheckoutReview({
  checkout,
  preview
}: {
  checkout: PendingEventCheckout;
  preview: CheckoutPreviewState;
}) {
  if (preview.status === "loading" || preview.status === "idle") {
    return (
      <div className="mb-4 rounded-[22px] border border-black/5 bg-[#fafafa] p-5">
        <LoadingState label="Loading checkout" />
      </div>
    );
  }

  if (preview.status === "error" || !preview.event) {
    return (
      <div className="mb-4 rounded-[22px] border border-[#f3dfb9] bg-[#fff8e9] p-4 text-sm font-medium text-[#8a5a08]">
        {preview.message ?? "We could not load this event checkout. Please choose the ticket again."}
      </div>
    );
  }

  const ticketType = getPendingCheckoutTicketType(preview.event, checkout);

  if (!ticketType) {
    return (
      <div className="mb-4 rounded-[22px] border border-[#f3dfb9] bg-[#fff8e9] p-4 text-sm font-medium text-[#8a5a08]">
        This event no longer has that ticket available. Please choose again.
      </div>
    );
  }

  const ticketTotalKobo = ticketType.priceKobo * checkout.quantity;
  const totalKobo = MEMBERSHIP_AMOUNT_KOBO + ticketTotalKobo;

  return (
    <div className="mb-4 rounded-[24px] border border-black/5 bg-[#fafafa] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">Checkout review</p>
      <h2 className="mt-2 text-lg font-semibold text-[#0d0d0d]">{preview.event.title}</h2>
      <p className="mt-1 text-sm font-medium text-[#666666]">{formatEventDate(preview.event.startsAt)}</p>

      <div className="mt-4 grid gap-3 rounded-[18px] bg-white p-4">
        <CheckoutRow label="Membership" value={formatNaira(MEMBERSHIP_AMOUNT_KOBO)} />
        <CheckoutRow label="Ticket" value={`${normalizeTicketTierName(ticketType.name)} x ${checkout.quantity}`} />
        <CheckoutRow label="Ticket total" value={formatNaira(ticketTotalKobo)} />
        <div className="h-px bg-black/5" />
        <CheckoutRow label="Total" value={formatNaira(totalKobo)} strong />
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-[#0d0d0d]">
      <LoadingState label="Loading" />
    </main>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const isAuthEntry = Boolean(nextPath || searchParams.get("mode") || searchParams.get("passwordReset") === "1");
  const { status, token, user, setSession, updateSessionUser, logout: clearSession } = useSession();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingEventCheckout, setPendingEventCheckout] = useState<PendingEventCheckout | null>(() => getPendingEventCheckout());
  const [checkoutPreview, setCheckoutPreview] = useState<CheckoutPreviewState>(() =>
    pendingEventCheckout ? { status: "loading", event: null } : { status: "idle", event: null }
  );
  const hasStartedPendingCheckout = useRef(false);

  const canEnterApp = useMemo(() => isActiveMember(user), [user]);

  useEffect(() => {
    if (status === "unauthenticated" && !isAuthEntry) {
      router.replace("/events");
    }
  }, [isAuthEntry, router, status]);

  const isPendingCheckoutReady = useMemo(() => {
    return Boolean(
      pendingEventCheckout &&
      checkoutPreview.status === "ready" &&
      checkoutPreview.event &&
      getPendingCheckoutTicketType(checkoutPreview.event, pendingEventCheckout)
    );
  }, [checkoutPreview, pendingEventCheckout]);

  useEffect(() => {
    if (!pendingEventCheckout) {
      return undefined;
    }

    let isCancelled = false;
    const checkout = pendingEventCheckout;

    async function loadCheckoutEvent() {
      await Promise.resolve();

      if (isCancelled) {
        return;
      }

      setCheckoutPreview({ status: "loading", event: null });

      try {
        const event = await apiRequest<StreetzEvent>(`/public/events/${checkout.eventId}`);

        if (!isCancelled) {
          setCheckoutPreview({ status: "ready", event });
        }
      } catch (error) {
        if (!isCancelled) {
          setCheckoutPreview({ status: "error", event: null, message: getUserErrorMessage(error) });
        }
      }
    }

    void loadCheckoutEvent();

    return () => {
      isCancelled = true;
    };
  }, [pendingEventCheckout]);

  useEffect(() => {
    if (searchParams.get("mode") !== "create") {
      return undefined;
    }

    const timer = window.setTimeout(() => setAuthMode("register"), 0);

    return () => window.clearTimeout(timer);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);

    if (url.searchParams.get("passwordReset") === "1") {
      url.searchParams.delete("passwordReset");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      const timer = window.setTimeout(() => {
        setMessage("Password updated. Log in with your new password.");
      }, 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, []);

  const startPendingEventCheckout = useCallback(async (
    accessToken: string,
    checkout: PendingEventCheckout,
    options: { redirectOnFailure?: boolean } = {}
  ) => {
    setIsStartingPayment(true);
    setMessage(null);

    try {
      const response = await apiRequest<{
        authorizationUrl?: string;
        subscriptionStatus?: "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
        subscriptionEndsAt?: string | null;
      }>(`/payments/events/${checkout.eventId}/checkout/initialize`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ quantity: checkout.quantity, ticketTypeId: checkout.ticketTypeId }),
      });

      if (response.subscriptionStatus) {
        updateSessionUser((current) => ({
          ...current,
          subscriptionStatus: response.subscriptionStatus ?? current.subscriptionStatus,
          subscriptionEndsAt: response.subscriptionEndsAt ?? current.subscriptionEndsAt,
        }));
      }

      if (!response.authorizationUrl) {
        clearPendingEventCheckout();
        setPendingEventCheckout(null);
        setCheckoutPreview({ status: "idle", event: null });
        router.replace(`/events/${checkout.eventId}`);
        return;
      }

      window.location.assign(response.authorizationUrl);
    } catch (error) {
      hasStartedPendingCheckout.current = false;
      const errorMessage = getUserErrorMessage(error);

      if (options.redirectOnFailure) {
        clearPendingEventCheckout();
        setPendingEventCheckout(null);
        setCheckoutPreview({ status: "idle", event: null });
        savePendingEventCheckoutNotice(errorMessage);
        router.replace(`/events/${checkout.eventId}`);
        return;
      }

      setMessage(errorMessage);
    } finally {
      setIsStartingPayment(false);
    }
  }, [router, updateSessionUser]);

  useEffect(() => {
    if (status !== "authenticated" || !user || !canEnterApp) {
      return;
    }

    const checkout = getPendingEventCheckout();

    if (checkout && token && !hasStartedPendingCheckout.current) {
      hasStartedPendingCheckout.current = true;
      void startPendingEventCheckout(token, checkout, { redirectOnFailure: true });
      return;
    }

    router.replace(nextPath ?? getDefaultRoute(user));
  }, [canEnterApp, nextPath, router, startPendingEventCheckout, status, token, user]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const validationMessage = getAuthValidationMessage({ authMode, displayName, email, password, ageConfirmed });

    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setIsSubmittingAuth(true);

    try {
      const payload = authMode === "register"
        ? { displayName: displayName.trim(), email: email.trim(), password, ageConfirmed }
        : { email: email.trim(), password };
      const auth = await apiRequest<AuthResponse>(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSession(auth.accessToken, auth.user);
      setPassword("");

      if (isActiveMember(auth.user) && !getPendingEventCheckout()) {
        router.replace(nextPath ?? getDefaultRoute(auth.user));
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

    const checkout = pendingEventCheckout ?? getPendingEventCheckout();

    if (checkout) {
      hasStartedPendingCheckout.current = true;
      await startPendingEventCheckout(token, checkout);
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

  function logout() {
    clearSession({ redirect: false });
    setAuthMode("login");
  }

  if (status === "checking") {
    return <LoadingShell />;
  }

  if (!user) {
    if (!isAuthEntry) {
      return <LoadingShell />;
    }

    return (
      <AuthShell
        authMode={authMode}
        displayName={displayName}
        email={email}
        password={password}
        ageConfirmed={ageConfirmed}
        message={message}
        isSubmitting={isSubmittingAuth}
        onModeChange={setAuthMode}
        onDisplayNameChange={setDisplayName}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onAgeConfirmedChange={setAgeConfirmed}
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
        title={pendingEventCheckout ? "" : undefined}
        buttonLabel={pendingEventCheckout ? "Continue to Paystack" : undefined}
        isActionDisabled={Boolean(pendingEventCheckout) && !isPendingCheckoutReady}
        onStartSubscription={startSubscription}
        onLogout={logout}
      >
        {pendingEventCheckout ? <PendingEventCheckoutReview checkout={pendingEventCheckout} preview={checkoutPreview} /> : null}
      </PaywallShell>
    );
  }

  return <LoadingShell />;
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <HomeContent />
    </Suspense>
  );
}
