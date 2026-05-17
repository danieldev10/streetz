"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TOKEN_KEY, UNAUTHORIZED_EVENT, apiRequest, authHeaders } from "@/lib/api";
import type { StreetzUser } from "@/lib/types";

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
      cachedSession = {
        token,
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

  const clearSession = useCallback(
    (options: { redirect?: boolean } = {}) => {
      cachedSession = null;
      pendingVerification = null;
      sessionRef.current = null;

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TOKEN_KEY);
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
    const nextSession = {
      token,
      user,
      verifiedAt: Date.now(),
    };

    cachedSession = nextSession;
    sessionRef.current = nextSession;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_KEY, token);
    }

    setSessionState(nextSession);
    setStatus("authenticated");
  }, []);

  const refreshSession = useCallback(async (options: { force?: boolean } = {}) => {
    if (typeof window === "undefined") {
      return null;
    }

    const savedToken = window.localStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      clearSession({ redirect: false });
      return null;
    }

    try {
      const nextSession = await verifyToken(savedToken, options);
      sessionRef.current = nextSession;
      setSessionState(nextSession);
      setStatus("authenticated");
      return nextSession;
    } catch {
      clearSession();
      return null;
    }
  }, [clearSession]);

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
      const savedToken = window.localStorage.getItem(TOKEN_KEY);

      if (!savedToken) {
        if (!cancelled) {
          cachedSession = null;
          sessionRef.current = null;
          setSessionState(null);
          setStatus("unauthenticated");
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
          clearSession();
        }
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(() => {
    function handleUnauthorized() {
      clearSession();
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
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
      window.removeEventListener("storage", handleStorage);
    };
  }, [clearSession, refreshSession]);

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
