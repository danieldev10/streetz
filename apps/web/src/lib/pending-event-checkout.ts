export type PendingEventCheckout = {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  createdAt: number;
};

const PENDING_EVENT_CHECKOUT_KEY = "crushclub_pending_event_checkout";
const PENDING_EVENT_CHECKOUT_NOTICE_KEY = "crushclub_pending_event_checkout_notice";
const PENDING_EVENT_CHECKOUT_MAX_AGE_MS = 30 * 60 * 1000;

function isPendingEventCheckout(value: unknown): value is PendingEventCheckout {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PendingEventCheckout>;

  return (
    typeof candidate.eventId === "string" &&
    candidate.eventId.length > 0 &&
    typeof candidate.ticketTypeId === "string" &&
    candidate.ticketTypeId.length > 0 &&
    typeof candidate.quantity === "number" &&
    Number.isInteger(candidate.quantity) &&
    candidate.quantity > 0 &&
    typeof candidate.createdAt === "number"
  );
}

export function savePendingEventCheckout(intent: Omit<PendingEventCheckout, "createdAt">) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PENDING_EVENT_CHECKOUT_KEY, JSON.stringify({ ...intent, createdAt: Date.now() }));
}

export function getPendingEventCheckout() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PENDING_EVENT_CHECKOUT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isPendingEventCheckout(parsed) || Date.now() - parsed.createdAt > PENDING_EVENT_CHECKOUT_MAX_AGE_MS) {
      clearPendingEventCheckout();
      return null;
    }

    return parsed;
  } catch {
    clearPendingEventCheckout();
    return null;
  }
}

export function clearPendingEventCheckout() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_EVENT_CHECKOUT_KEY);
}
export function savePendingEventCheckoutNotice(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PENDING_EVENT_CHECKOUT_NOTICE_KEY, message);
}

export function consumePendingEventCheckoutNotice() {
  if (typeof window === "undefined") {
    return null;
  }

  const message = window.sessionStorage.getItem(PENDING_EVENT_CHECKOUT_NOTICE_KEY);
  window.sessionStorage.removeItem(PENDING_EVENT_CHECKOUT_NOTICE_KEY);

  return message;
}

