import type { AuthResponse, StreetzUser } from "./types";
import { ApiError, SessionChangedError } from "./api-error";
import { timeoutSignal } from "./request-timeout";

export const SESSION_REVISION_KEY = "crushclub_auth_revision_v1";
const LOCK_PREFIX = "crushclub_auth_lock_v1:";
const CHANNEL_NAME = "crushclub_auth_v1";
const LEGACY_KEYS = ["streetz_access_token", "access_token"];
type Revision = { id: string; kind: "login" | "logout" };
type Change = "login" | "refresh" | "logout" | "expired" | "user";
type Lease = { choosing: boolean; ticket: number; expires: number };

export type SessionPlatform = {
  storage?: Storage;
  locks?: Pick<LockManager, "request">;
  channel?: Pick<BroadcastChannel, "postMessage" | "addEventListener">;
  listenStorage: (listener: (event: Pick<StorageEvent, "key">) => void) => void;
  id: () => string;
};

// Only revision identifiers and lock metadata are persisted. Credentials and
// user data stay in memory; cookie rotation is serialized across browser tabs.
export class BrowserSession {
  private auth: AuthResponse | null = null;
  private revision = "initial";
  private revisionKind: Revision["kind"] | "initial" = "initial";
  private pendingRefresh: Promise<AuthResponse> | null = null;
  private listeners = new Set<(auth: AuthResponse | null, change: Change) => void>();
  private readonly tabId: string;
  private readStoredMetadata = true;

  constructor(private readonly platform: SessionPlatform) {
    this.tabId = platform.id();
    for (const key of LEGACY_KEYS) {
      try { platform.storage?.removeItem(key); } catch { /* Private browsing can deny storage. */ }
    }
    const initial = this.readRevision();
    this.revision = initial?.id ?? "initial";
    this.revisionKind = initial?.kind ?? "initial";
    platform.listenStorage((event) => {
      if (event.key === SESSION_REVISION_KEY) this.observeRevision();
    });
    platform.channel?.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as { revision?: Revision; sender?: string; persisted?: boolean } | null;
      if (data?.sender !== this.tabId && this.isRevision(data?.revision)) {
        if (typeof data.persisted === "boolean") this.readStoredMetadata = data.persisted;
        this.observeRevision(data.revision);
      }
    });
  }

  get current() { return this.auth; }
  get version() { this.observeRevision(); return this.revision; }
  subscribe(listener: (auth: AuthResponse | null, change: Change) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async authenticate(request: () => Promise<AuthResponse>) {
    const revision = this.version;
    return this.withCookieLock(async () => {
      this.assertRevision(revision);
      const auth = await request();
      this.assertRevision(revision);
      this.validateAuth(auth);
      this.writeRevision("login");
      this.auth = auth;
      this.emit("login");
      return auth;
    });
  }

  async refresh(request: () => Promise<AuthResponse>) {
    this.observeRevision();
    if (this.revisionKind === "logout") throw new ApiError("Please log in again.", 401);
    if (!this.pendingRefresh) {
      const revision = this.version;
      const pending = this.withCookieLock(async () => {
        this.assertRevision(revision);
        const auth = await request();
        this.assertRevision(revision);
        this.validateAuth(auth);
        this.auth = auth;
        this.emit("refresh");
        return auth;
      }).catch((error: unknown) => {
        // Network failures do not sign the user out. An old request must never
        // erase a newer login or revive a session after logout.
        if (error instanceof ApiError && error.status === 401 && this.version === revision) {
          this.auth = null;
          this.emit("expired");
        }
        throw error;
      }).finally(() => {
        if (this.pendingRefresh === pending) this.pendingRefresh = null;
      });
      this.pendingRefresh = pending;
    }
    return this.pendingRefresh;
  }

  async logout(request: () => Promise<void>) {
    this.writeRevision("logout");
    this.auth = null;
    this.emit("logout");
    const revision = this.revision;
    // The tombstone also prevents an offline logout from silently logging the
    // user back in on reload. Explicit login starts a fresh session.
    await this.withCookieLock(async () => {
      if (this.version === revision) await request();
    });
  }

  expire(revision: string) {
    if (this.version !== revision) return;
    this.auth = null;
    this.emit("expired");
  }

  updateUser(user: StreetzUser, revision = this.version) {
    this.assertRevision(revision);
    if (this.auth?.user.id !== user.id) throw new SessionChangedError();
    this.auth = { ...this.auth, user };
    this.emit("user");
  }

  assertRevision(revision: string) {
    if (this.version !== revision) throw new SessionChangedError();
  }

  private validateAuth(auth: AuthResponse) {
    if (!auth?.accessToken || !auth.user?.id) throw new ApiError("Invalid session response.", 502);
  }
  private emit(change: Change) {
    for (const listener of this.listeners) listener(this.auth, change);
  }
  private isRevision(value: unknown): value is Revision {
    const revision = value as Revision | null;
    return Boolean(revision && typeof revision.id === "string" &&
      ["login", "logout"].includes(revision.kind));
  }
  private readRevision(): Revision | null {
    if (!this.readStoredMetadata) return null;
    try {
      const data: unknown = JSON.parse(this.platform.storage?.getItem(SESSION_REVISION_KEY) ?? "null");
      return this.isRevision(data) ? data : null;
    } catch { return null; }
  }
  private writeRevision(kind: Revision["kind"]) {
    const revision = { id: this.platform.id(), kind };
    this.revision = revision.id;
    this.revisionKind = kind;
    let persisted = false;
    try {
      if (this.platform.storage) {
        this.platform.storage.setItem(SESSION_REVISION_KEY, JSON.stringify(revision));
        persisted = true;
      }
    } catch { /* Use channel when available. */ }
    // A full/blocked storage area can retain an old revision. Never let it
    // overwrite the new in-memory login or logout on the next request.
    this.readStoredMetadata = persisted;
    this.platform.channel?.postMessage({ revision, sender: this.tabId, persisted });
  }
  private observeRevision(message?: Revision) {
    const revision = this.readRevision() ?? message;
    if (!revision || revision.id === this.revision) return;
    this.revision = revision.id;
    this.revisionKind = revision.kind;
    this.pendingRefresh = null;
    this.auth = null;
    this.emit(revision.kind);
  }

  private async withCookieLock<T>(action: () => Promise<T>): Promise<T> {
    if (this.platform.locks) {
      return this.platform.locks.request(CHANNEL_NAME, { mode: "exclusive", signal: timeoutSignal(30_000) }, action);
    }
    // Safari/older browser fallback: Lamport's bakery algorithm. Unlike one
    // read/write lease key, contenders cannot overwrite each other's claims.
    const storage = this.platform.storage;
    if (!storage) throw new ApiError("Session coordination is unavailable. Please retry in a supported browser.", 503);
    const key = `${LOCK_PREFIX}${this.platform.id()}`;
    const deadline = Date.now() + 30_000;
    const readLeases = () => {
      const leases: [string, Lease][] = [];
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      for (const candidate of keys) {
        if (!candidate?.startsWith(LOCK_PREFIX)) continue;
        try {
          const lease = JSON.parse(storage.getItem(candidate) ?? "null") as Lease | null;
          if (lease && lease.expires > Date.now() && Number.isFinite(lease.ticket)) leases.push([candidate, lease]);
          else storage.removeItem(candidate);
        } catch { /* Ignore malformed metadata. */ }
      }
      return leases;
    };
    let entered = false;
    try {
      storage.setItem(key, JSON.stringify({ choosing: true, ticket: 0, expires: Date.now() + 60_000 }));
      const ticket = Math.max(0, ...readLeases().map(([, lease]) => lease.ticket)) + 1;
      storage.setItem(key, JSON.stringify({ choosing: false, ticket, expires: Date.now() + 60_000 }));
      while (readLeases().some(([candidate, lease]) => candidate !== key &&
        (lease.choosing || lease.ticket < ticket || (lease.ticket === ticket && candidate < key)))) {
        if (Date.now() > deadline) throw new ApiError("Your session is busy. Please try again.", 503);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      entered = true;
      return await action();
    } catch (error) {
      if (!entered && !(error instanceof ApiError)) {
        throw new ApiError("Session coordination is unavailable. Please allow browser storage or use a supported browser.", 503);
      }
      throw error;
    } finally {
      try { storage.removeItem(key); } catch { /* The lease eventually expires. */ }
    }
  }
}

let browserSession: BrowserSession | undefined;
export function getBrowserSession() {
  if (typeof window === "undefined") throw new ApiError("Session access requires a browser.", 401);
  if (!browserSession) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Private browser policy. */ }
    let channel: BroadcastChannel | undefined;
    try { if (typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel(CHANNEL_NAME); } catch { /* Storage events remain available. */ }
    browserSession = new BrowserSession({
      storage, channel, locks: navigator.locks,
      listenStorage: (listener) => window.addEventListener("storage", listener),
      id: () => crypto.randomUUID(),
    });
  }
  return browserSession;
}

export function tokenExpiresSoon(token: string, marginMs = 60_000) {
  try {
    const body = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(body)) as { exp?: number };
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now() + marginMs;
  } catch { return true; }
}
