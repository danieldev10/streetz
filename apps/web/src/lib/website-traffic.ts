import { timeoutSignal } from "./request-timeout";

export const TRAFFIC_VISIT_KEY = "crushclub_visit_v1";
export const VISIT_IDLE_MS = 30 * 60_000;
export type PageKind = "LANDING" | "LOGIN" | "SIGNUP" | "OTHER";
export type PageView = { eventId: string; visitId: string; pageKind: PageKind };
type Visit = { id: string; activeAt: number };
type Platform = {
  now: () => number;
  id: () => string;
  read: () => string | null;
  write: (value: string) => void;
  send: (view: PageView, token?: string) => Promise<void>;
};

// Only an expiring random visit identifier is stored, never a route or account.
export class WebsiteTrafficTracker {
  private visit: Visit | null = null;
  private lastView = "";
  constructor(private readonly platform: Platform) {}

  async view(key: string, pageKind: PageKind, token?: string) {
    const visit = this.currentVisit();
    const viewKey = `${visit.id}:${token ? "member" : "guest"}:${key}`;
    if (viewKey === this.lastView) return;
    this.lastView = viewKey;
    this.save({ ...visit, activeAt: this.platform.now() });
    await this.platform.send({ eventId: this.platform.id(), visitId: visit.id, pageKind }, token);
  }

  touch() {
    if (!this.visit) return;
    const visit = this.currentVisit();
    // Avoid writing on every mouse movement/key press.
    if (this.platform.now() - visit.activeAt >= 60_000) this.save({ ...visit, activeAt: this.platform.now() });
  }

  private currentVisit() {
    const now = this.platform.now();
    let stored: Visit | null = null;
    try { stored = JSON.parse(this.platform.read() ?? "null") as Visit | null; } catch { /* Storage may be unavailable. */ }
    const candidate = this.visit && this.visit.activeAt > (stored?.activeAt ?? 0) ? this.visit : stored ?? this.visit;
    if (candidate && /^[0-9a-f-]{36}$/i.test(candidate.id) && Number.isFinite(candidate.activeAt) &&
      now >= candidate.activeAt && now - candidate.activeAt < VISIT_IDLE_MS) {
      this.visit = candidate;
    } else {
      this.save({ id: this.platform.id(), activeAt: now });
    }
    return this.visit!;
  }

  private save(visit: Visit) {
    this.visit = visit;
    try { this.platform.write(JSON.stringify(visit)); } catch { /* Fall back to this tab's memory. */ }
  }
}

export function trafficHost(hostname: string) {
  return ["crushclub.ng", "www.crushclub.ng", "staging.crushclub.ng"].includes(hostname);
}

export function trafficPage(pathname: string): PageKind | null {
  if (pathname === "/" || /^\/(admin|users|reports|check-in)(\/|$)/.test(pathname) ||
    /^\/(events|rooms)\/(create|[^/]+\/edit)$/.test(pathname)) return null;
  return pathname === "/events" ? "LANDING" : "OTHER";
}

export async function sendPageView(endpoint: string, view: PageView, token?: string, request = fetch,
  pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))) {
  // Deliberately separate from authenticated apiRequest: analytics failures must
  // never refresh cookies, expire a session, or interrupt a customer action.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await request(endpoint, {
        method: "POST", credentials: "omit", keepalive: true,
        headers: { "Content-Type": "application/json", "x-crushclub-client": "web", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(view), signal: timeoutSignal(5000),
      });
      if (response.status < 500 || attempt === 1) return;
    } catch { if (attempt === 1) return; }
    await pause(1000);
  }
}
