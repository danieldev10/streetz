"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUTH_REFRESHED_EVENT,
  TOKEN_KEY,
  UNAUTHORIZED_EVENT,
  apiRequest,
  authHeaders,
  clearLegacyAccessTokens,
  refreshAccessToken,
  revokeRefreshSession,
} from "@/lib/api";
import type { AuthResponse, StreetzUser } from "@/lib/types";

type VerifiedSession = {
  token: string;
  user: StreetzUser;
  verifiedAt: number;
};

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

let cachedSession: VerifiedSession | null = null;
let pendingVerification: { token: string; promise: Promise<VerifiedSession> } | null = null;

const SessionContext = createContext<SessionContextValue | null>(null);

function getInitialStatus(): SessionStatus {
  return cachedSession ? "authenticated" : "checking";
}

async function verifyToken(token: string, options: { force?: boolean } = {}) {
  if (!options.force && cachedSession?.token === token) {
    return cachedSession;
  }

  if (!options.force && pendingVerification?.token === token) {
    return pendingVerification.promise;
  }

  const promise = apiRequest<StreetzUser>("/auth/me", {
    headers: authHeaders(token),
  })
    .then((user) => {
      const currentToken = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) ?? token : token;
      cachedSession = {
        token: currentToken,
        user,
        verifiedAt: Date.now(),
      };

      return cachedSession;
    })
    .finally(() => {
      if (pendingVerification?.promise === promise) {
        pendingVerification = null;
      }
    });

  pendingVerification = {
    token,
    promise,
  };

  return promise;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>(getInitialStatus);
  const [session, setSessionState] = useState<VerifiedSession | null>(() => cachedSession);
  const sessionRef = useRef<VerifiedSession | null>(cachedSession);

  const applySession = useCallback((token: string, user: StreetzUser) => {
    const nextSession = {
      token,
      user,
      verifiedAt: Date.now(),
    };

    cachedSession = nextSession;
    sessionRef.current = nextSession;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_KEY, token);
      clearLegacyAccessTokens();
    }

    setSessionState(nextSession);
    setStatus("authenticated");

    return nextSession;
  }, []);

  const clearSession = useCallback(
    (options: { redirect?: boolean; revoke?: boolean } = {}) => {
      cachedSession = null;
      pendingVerification = null;
      sessionRef.current = null;

      if (typeof window !== "undefined") {
        if (options.revoke !== false) {
          void revokeRefreshSession();
        }

        window.localStorage.removeItem(TOKEN_KEY);
        clearLegacyAccessTokens();
      }

      setSessionState(null);
      setStatus("unauthenticated");

      if (options.redirect !== false) {
        router.replace("/");
      }
    },
    [router]
  );

  const setSession = useCallback((token: string, user: StreetzUser) => {
    applySession(token, user);
  }, [applySession]);

  const refreshSession = useCallback(async (options: { force?: boolean } = {}) => {
    if (typeof window === "undefined") {
      return null;
    }

    const savedToken = window.localStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      try {
        const refreshedAuth = await refreshAccessToken();
        return applySession(refreshedAuth.accessToken, refreshedAuth.user);
      } catch {
        clearSession({ redirect: false, revoke: false });
        return null;
      }
    }

    try {
      const nextSession = await verifyToken(savedToken, options);
      sessionRef.current = nextSession;
      setSessionState(nextSession);
      setStatus("authenticated");
      return nextSession;
    } catch {
      clearSession({ revoke: false });
      return null;
    }
  }, [applySession, clearSession]);

  const updateSessionUser = useCallback((updater: (user: StreetzUser) => StreetzUser) => {
    setSessionState((current) => {
      if (!current) {
        return current;
      }

      const nextSession = {
        ...current,
        user: updater(current.user),
      };

      cachedSession = nextSession;
      sessionRef.current = nextSession;
      setStatus("authenticated");

      return nextSession;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      clearLegacyAccessTokens();
      const savedToken = window.localStorage.getItem(TOKEN_KEY);

      if (!savedToken) {
        try {
          const refreshedAuth = await refreshAccessToken();

          if (!cancelled) {
            applySession(refreshedAuth.accessToken, refreshedAuth.user);
          }
        } catch {
          if (!cancelled) {
            cachedSession = null;
            sessionRef.current = null;
            setSessionState(null);
            setStatus("unauthenticated");
          }
        }
        return;
      }

      if (cachedSession?.token === savedToken) {
        if (!cancelled) {
          sessionRef.current = cachedSession;
          setSessionState(cachedSession);
          setStatus("authenticated");
        }
        return;
      }

      try {
        const nextSession = await verifyToken(savedToken);

        if (!cancelled) {
          sessionRef.current = nextSession;
          setSessionState(nextSession);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          clearSession({ revoke: false });
        }
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  useEffect(() => {
    function handleUnauthorized() {
      clearSession();
    }

    function handleAuthRefreshed(event: Event) {
      const auth = (event as CustomEvent<AuthResponse>).detail;

      if (auth?.accessToken && auth.user) {
        applySession(auth.accessToken, auth.user);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== TOKEN_KEY) {
        return;
      }

      if (!event.newValue) {
        clearSession();
        return;
      }

      if (event.newValue !== sessionRef.current?.token) {
        setStatus("checking");
        void refreshSession();
      }
    }

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    window.addEventListener(AUTH_REFRESHED_EVENT, handleAuthRefreshed);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
      window.removeEventListener(AUTH_REFRESHED_EVENT, handleAuthRefreshed);
      window.removeEventListener("storage", handleStorage);
    };
  }, [applySession, clearSession, refreshSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      token: session?.token ?? null,
      user: session?.user ?? null,
      setSession,
      updateSessionUser,
      refreshSession,
      logout: clearSession,
    }),
    [clearSession, refreshSession, session?.token, session?.user, setSession, status, updateSessionUser]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within SessionProvider.");
  }

  return context;
}
