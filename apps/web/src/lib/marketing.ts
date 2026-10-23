// Public identifier, not a credential. Staging, previews and localhost never send
// to this pixel, even though Vercel calls their deployments "Production" too.
export const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "DBDN6URC77UFSQ3BRQOG";
export const CONSENT_KEY = "ccl.marketing-consent.v1";
const PENDING_KEY = "ccl.marketing-pending.v1";
const SENT_KEY = "ccl.marketing-sent.v1";
export const MARKETING_CHANGE = "ccl:marketing-change";
const CONSENT_TTL = 180 * 24 * 60 * 60 * 1000;
const EVENT_TTL = 30 * 60 * 1000;
type Properties = { content_ids?: string[]; content_type?: "product"; currency?: "NGN"; value?: number; quantity?: number };
type MarketingEvent = { name: "CompleteRegistration" | "InitiateCheckout" | "Purchase"; id: string; properties: Properties; at: number };
export type AnalyticsPurchase = { eventId: string; contentId: string; value: number; currency: "NGN"; quantity: number };
type Pixel = {
  page: () => void;
  track: (name: string, properties?: Properties, options?: { event_id: string }) => void;
  holdConsent: () => void;
  grantConsent: () => void;
  revokeConsent: () => void;
  disableCookie: () => void;
};
declare global { interface Window { ttq?: Pixel; TiktokAnalyticsObject?: string } }
let memoryConsent: { allowed: boolean; at: number } | null = null;
let memoryOnly = false;
let pixelLoaded = false;
let currentContentId: string | null = null;
let lastContentPage = "";

export function setMarketingEventView(contentId: string | null) {
  currentContentId = contentId;
  window.dispatchEvent(new Event(MARKETING_CHANGE));
}

export function marketingHost(hostname: string) {
  return hostname === "crushclub.ng" || hostname === "www.crushclub.ng";
}

/** Only public event pages; reject arbitrary queries/fragments so the SDK never
 * sees callback references, guest tokens, user searches or account URLs. */
export function marketingPage(url: URL) {
  return !/^\/events\/(create|history|tickets)\/?$/.test(url.pathname) &&
    /^\/events(?:\/[a-zA-Z0-9_-]{1,100})?\/?$/.test(url.pathname) && !url.hash &&
    [...url.searchParams].every(([key, value]) => key === "ttclid" && /^[a-zA-Z0-9_.-]{1,512}$/.test(value));
}

export function marketingLandingUrl(url: URL): URL | null {
  const clean = new URL(url);
  // Ad managers commonly append UTM labels. Drop those labels entirely rather
  // than passing advertiser-entered free text to a third party.
  for (const key of [...clean.searchParams.keys()]) {
    if (/^utm_(source|medium|campaign|term|content|id|source_platform|creative_format|marketing_tactic)$/.test(key)) clean.searchParams.delete(key);
  }
  return marketingPage(clean) ? clean : null;
}

export function readMarketingConsent(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    if (!memoryOnly) {
      const saved = window.localStorage.getItem(CONSENT_KEY);
      memoryConsent = saved ? JSON.parse(saved) : null;
    }
  } catch { /* A blocked storage API keeps this visit's explicit choice in memory. */ }
  return memoryConsent && typeof memoryConsent.allowed === "boolean" && Number.isFinite(memoryConsent.at) &&
    memoryConsent.at <= Date.now() && Date.now() - memoryConsent.at < CONSENT_TTL ? memoryConsent.allowed : null;
}

export function setMarketingConsent(allowed: boolean) {
  memoryConsent = { allowed, at: Date.now() };
  try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(memoryConsent)); memoryOnly = false; } catch { memoryOnly = true; }
  if (!allowed) {
    window.ttq?.revokeConsent();
    window.ttq?.disableCookie();
    try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* optional */ }
    clearMarketingCookies();
  }
  window.dispatchEvent(new Event(MARKETING_CHANGE));
}

export function invalidateMarketingConsent() {
  memoryOnly = false;
  memoryConsent = null;
}

function clearMarketingCookies() {
  // These are TikTok's first-party cookies; essential login cookies stay intact.
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (!/^(_ttp|_tt_enable_cookie|ttcsid(?:_.+)?|ttclid|ttoclid)$/.test(name)) continue;
    for (const domain of ["", window.location.hostname, ".crushclub.ng"]) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax; Secure${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

function pendingEvents(): MarketingEvent[] {
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item): item is MarketingEvent => validEvent(item)) : [];
  } catch { return []; }
}

function validEvent(item: MarketingEvent) {
  if (!item || !["CompleteRegistration", "InitiateCheckout", "Purchase"].includes(item.name) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || !Number.isFinite(item.at) ||
      item.at > Date.now() || Date.now() - item.at > EVENT_TTL) return false;
  const props = item.properties;
  if (!props || Object.keys(props).some((key) => !["content_ids", "content_type", "currency", "value", "quantity"].includes(key))) return false;
  if (item.name === "CompleteRegistration") return Object.keys(props).length === 0;
  return props.currency === "NGN" && props.content_type === "product" &&
    typeof props.value === "number" && Number.isFinite(props.value) && props.value > 0 && props.value < 1e10 &&
    Number.isInteger(props.quantity) && props.quantity! > 0 && props.quantity! <= 20 &&
    Array.isArray(props.content_ids) && props.content_ids.length === 1 && /^[a-zA-Z0-9_-]{1,100}$/.test(props.content_ids[0]);
}

function queueEvent(event: Omit<MarketingEvent, "at">) {
  if (typeof window === "undefined" || !marketingHost(window.location.hostname) || readMarketingConsent() !== true) return;
  const item = { ...event, at: Date.now() };
  if (!validEvent(item)) return;
  try {
    const pending = pendingEvents().filter((entry) => entry.id !== item.id);
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify([...pending, item].slice(-20)));
    window.dispatchEvent(new Event(MARKETING_CHANGE));
  } catch { /* Analytics must never interrupt registration or payment. */ }
}

export function trackRegistration() {
  queueEvent({ name: "CompleteRegistration", id: analyticsId(), properties: {} });
}

export function trackCheckout(contentId: string, amountKobo: number, quantity: number) {
  queueEvent({ name: "InitiateCheckout", id: analyticsId(), properties: {
    content_ids: [contentId], content_type: "product", value: amountKobo / 100, currency: "NGN", quantity,
  } });
}

function analyticsId() {
  try { return crypto.randomUUID(); } catch {
    // Not a credential: uniqueness only. Older browsers must still check out.
    return `event_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export function trackPurchase(receipt: AnalyticsPurchase | undefined) {
  if (!receipt || !/^ccl_[a-f0-9]{64}$/.test(receipt.eventId)) return;
  queueEvent({ name: "Purchase", id: receipt.eventId, properties: {
    content_ids: [receipt.contentId], content_type: "product", value: receipt.value, currency: receipt.currency, quantity: receipt.quantity,
  } });
}

function flushEvents() {
  if (readMarketingConsent() !== true || !window.ttq || !marketingPage(new URL(window.location.href))) return;
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(SENT_KEY) || "[]");
    const sent: string[] = Array.isArray(saved) ? saved.filter((id) => typeof id === "string").slice(-499) : [];
    for (const event of pendingEvents()) {
      if (sent.includes(event.id)) continue;
      // Reserve before sending, including across callback reloads. If storage is
      // unavailable, skip rather than risk counting a purchase repeatedly.
      sent.push(event.id);
      window.localStorage.setItem(SENT_KEY, JSON.stringify(sent.slice(-500)));
      window.ttq.track(event.name, event.properties, { event_id: event.id });
    }
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch { /* Best effort browser analytics, never a booking dependency. */ }
}

function loadPixel() {
  if (pixelLoaded || !/^[A-Z0-9]{20}$/.test(TIKTOK_PIXEL_ID)) return;
  pixelLoaded = true;
  window.TiktokAnalyticsObject = "ttq";
  const queue: unknown[][] = [];
  const pixel = queue as unknown as Pixel;
  for (const method of ["page", "track", "holdConsent", "grantConsent", "revokeConsent", "disableCookie"] as const) {
    // TikTok's base-code queue is consumed by the official asynchronous SDK.
    Object.assign(pixel, { [method]: (...args: unknown[]) => queue.push([method, ...args]) });
  }
  const options = { autoConfig: false, autoConfigListener: false, historyObserver: false };
  Object.assign(pixel, { _i: { [TIKTOK_PIXEL_ID]: [] }, _t: { [TIKTOK_PIXEL_ID]: Date.now() }, _o: { [TIKTOK_PIXEL_ID]: options } });
  window.ttq = pixel;
  pixel.holdConsent();
  pixel.grantConsent();
  const script = document.createElement("script");
  script.async = true;
  script.referrerPolicy = "origin";
  script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${TIKTOK_PIXEL_ID}&lib=ttq`;
  document.head.appendChild(script);
}

/** Install before the SDK. Leaving public event pages tears down the tracking
 * document before private screens render; disabling SPA auto-pageviews alone
 * would leave a third-party script running beside account/chat forms. */
export function installMarketingNavigationGuard() {
  const originals = { pushState: history.pushState, replaceState: history.replaceState };
  for (const method of ["pushState", "replaceState"] as const) {
    history[method] = function (data, unused, url) {
      if (pixelLoaded && url != null) {
        const target = new URL(String(url), window.location.href);
        if (!marketingPage(target) || target.origin !== window.location.origin) {
          window.ttq?.revokeConsent();
          if (method === "replaceState") window.location.replace(target.href);
          else window.location.assign(target.href);
          return;
        }
      }
      return originals[method].call(history, data, unused, url);
    };
  }
  const onBack = () => {
    if (pixelLoaded && !marketingPage(new URL(window.location.href))) {
      window.ttq?.revokeConsent();
      window.location.reload();
    }
  };
  const onRestore = (event: PageTransitionEvent) => {
    if (event.persisted && pixelLoaded) window.location.reload();
  };
  window.addEventListener("popstate", onBack, true);
  window.addEventListener("pageshow", onRestore);
  return () => {
    Object.assign(history, originals);
    window.removeEventListener("popstate", onBack, true);
    window.removeEventListener("pageshow", onRestore);
  };
}

let lastPage = "";
export function syncMarketing(isAdmin: boolean, sessionReady: boolean) {
  if (!marketingHost(window.location.hostname)) return;
  const allowed = readMarketingConsent() === true && !isAdmin;
  if (!allowed) {
    window.ttq?.revokeConsent();
    clearMarketingCookies();
    try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* optional */ }
    if (pixelLoaded) window.location.reload();
    return;
  }
  if (!sessionReady) return;
  const landing = marketingLandingUrl(new URL(window.location.href));
  if (!landing) return;
  if (landing.href !== window.location.href) history.replaceState(history.state, "", landing.href);
  loadPixel();
  if (!window.ttq) return;
  const page = window.location.pathname;
  if (page !== lastPage) {
    lastPage = page;
    lastContentPage = "";
    window.ttq.page();
  }
  if (currentContentId && page.replace(/\/$/, "") === `/events/${currentContentId}` && lastContentPage !== page) {
    lastContentPage = page;
    window.ttq.track("ViewContent", { content_ids: [currentContentId], content_type: "product" });
  }
  flushEvents();
}
