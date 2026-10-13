"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { isPublicPersistableQuery } from "@/lib/public-query-persistence";
import { ApiError, apiRequest, authHeaders, refreshAccessToken, revokeRefreshSession } from "@/lib/api";
import { getBrowserSession, tokenExpiresSoon } from "@/lib/browser-session";
import type { AuthResponse, StreetzUser } from "@/lib/types";

type VerifiedSession = { token: string; user: StreetzUser; verifiedAt: number };
type SessionStatus = "checking" | "authenticated" | "unauthenticated";
type SessionContextValue = {
  status: SessionStatus;
  token: string | null;
  user: StreetzUser | null;
  setSession: (token: string, user: StreetzUser) => void;
  updateSessionUser: (updater: (user: StreetzUser) => StreetzUser) => void;
  refreshSession: (options?: { force?: boolean }) => Promise<VerifiedSession | null>;
  logout: (options?: { redirect?: boolean }) => void;
};
const SessionContext = createContext<SessionContextValue | null>(null);
const asVerified = (auth: AuthResponse): VerifiedSession => ({ token: auth.accessToken, user: auth.user, verifiedAt: Date.now() });

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [session, setSession] = useState<VerifiedSession | null>(null);
  const previousUser = useRef<string | null>(null);
  const suppressLogoutRedirect = useRef(false);

  const refreshSession = useCallback(async (options: { force?: boolean } = {}) => {
    const store = getBrowserSession();
    try {
      const auth = store.current ?? await refreshAccessToken();
      if (options.force) {
        const revision = store.version;
        const user = await apiRequest<StreetzUser>("/auth/me", { headers: authHeaders(auth.accessToken) });
        store.updateUser(user, revision);
      }
      return store.current ? asVerified(store.current) : null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }, []);

  useEffect(() => {
    const store = getBrowserSession();
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let unauthorizedRevision: string | undefined;
    const reconcile = (auth: AuthResponse | null, change: string) => {
      if (cancelled) return;
      if (!auth || (previousUser.current && previousUser.current !== auth.user.id)) {
        void queryClient.cancelQueries({ predicate: (query) => !isPublicPersistableQuery(query.queryKey) });
        queryClient.removeQueries({ predicate: (query) => !isPublicPersistableQuery(query.queryKey) });
      }
      previousUser.current = auth?.user.id ?? null;
      setSession(auth ? asVerified(auth) : null);
      setStatus(auth ? "authenticated" : change === "login" ? "checking" : "unauthenticated");
      if (change === "logout" && !suppressLogoutRedirect.current) router.replace("/?mode=login");
      if (change === "login" && !auth) void restore();
    };
    const restore = async () => {
      if (cancelled || refreshing) return;
      if (!store.current && store.version === unauthorizedRevision) return;
      if (store.current && !tokenExpiresSoon(store.current.accessToken)) return;
      const revision = store.version;
      refreshing = true;
      try {
        await refreshAccessToken();
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          if (store.version === revision && !store.current) {
            unauthorizedRevision = revision;
            reconcile(null, "expired");
          }
        } else {
          // Preserve sessions during temporary network/Redis outages. On initial
          // load remain checking rather than sending the user to login.
          clearTimeout(retry);
          retry = setTimeout(() => void restore(), 5_000);
        }
      } finally {
        refreshing = false;
        // A cross-tab login may arrive while the previous refresh is settling.
        if (!cancelled && store.version !== revision) void restore();
      }
    };
    const unsubscribe = store.subscribe(reconcile);
    if (store.current) reconcile(store.current, "refresh");
    void restore();
    const timer = setInterval(() => void restore(), 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void restore(); };
    window.addEventListener("online", restore);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
      clearTimeout(retry);
      window.removeEventListener("online", restore);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, router]);

  const applySession = useCallback((token: string, user: StreetzUser) => {
    // Login/register commit credentials inside the cookie lock in api.ts.
    const store = getBrowserSession();
    if (store.current?.accessToken === token) store.updateUser(user);
  }, []);
  const updateSessionUser = useCallback((updater: (user: StreetzUser) => StreetzUser) => {
    const store = getBrowserSession();
    if (store.current) store.updateUser(updater(store.current.user));
  }, []);
  const logout = useCallback((options: { redirect?: boolean } = {}) => {
    suppressLogoutRedirect.current = options.redirect === false;
    void revokeRefreshSession().catch(() => {
      // The logout marker keeps this browser signed out even offline.
    }).finally(() => { suppressLogoutRedirect.current = false; });
  }, []);
  const value = useMemo<SessionContextValue>(() => ({
    status, token: session?.token ?? null, user: session?.user ?? null,
    setSession: applySession, updateSessionUser, refreshSession, logout,
  }), [status, session, applySession, updateSessionUser, refreshSession, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider.");
  return context;
}
