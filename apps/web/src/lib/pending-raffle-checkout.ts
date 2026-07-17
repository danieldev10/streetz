export type PendingRaffleCheckout = {
  raffleId: string;
  quantity: number;
  createdAt: number;
};

const PENDING_RAFFLE_CHECKOUT_KEY = "crushclub_pending_raffle_checkout";
const PENDING_RAFFLE_CHECKOUT_MAX_AGE_MS = 30 * 60 * 1000;

function isPendingRaffleCheckout(value: unknown): value is PendingRaffleCheckout {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PendingRaffleCheckout>;

  return (
    typeof candidate.raffleId === "string" &&
    candidate.raffleId.length > 0 &&
    typeof candidate.quantity === "number" &&
    Number.isInteger(candidate.quantity) &&
    candidate.quantity > 0 &&
    typeof candidate.createdAt === "number"
  );
}

export function savePendingRaffleCheckout(intent: Omit<PendingRaffleCheckout, "createdAt">) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PENDING_RAFFLE_CHECKOUT_KEY, JSON.stringify({ ...intent, createdAt: Date.now() }));
}

export function getPendingRaffleCheckout() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PENDING_RAFFLE_CHECKOUT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isPendingRaffleCheckout(parsed) || Date.now() - parsed.createdAt > PENDING_RAFFLE_CHECKOUT_MAX_AGE_MS) {
      clearPendingRaffleCheckout();
      return null;
    }

    return parsed;
  } catch {
    clearPendingRaffleCheckout();
    return null;
  }
}

export function clearPendingRaffleCheckout() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_RAFFLE_CHECKOUT_KEY);
}
