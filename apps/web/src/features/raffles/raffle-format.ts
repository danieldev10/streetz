import type { RaffleStatus } from "@/lib/types";

export function formatRafflePrice(priceKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(priceKobo / 100);
}

const RAFFLE_STATUS_LABELS: Record<RaffleStatus, string> = {
  SCHEDULED: "Starting soon",
  SELLING: "Tickets on sale",
  SALES_CLOSED: "Sales closed",
  DRAWN: "Winner announced",
  CANCELLED: "Cancelled"
};

export function getRaffleStatusLabel(status: RaffleStatus) {
  return RAFFLE_STATUS_LABELS[status];
}

export function getRaffleStatusTone(status: RaffleStatus) {
  if (status === "SELLING") {
    return "bg-[#f6e0f6] text-[#7c1f7d]";
  }

  if (status === "DRAWN") {
    return "bg-[#d4fae8] text-[#0b7a50]";
  }

  if (status === "CANCELLED") {
    return "bg-[#fdecec] text-[#b3261e]";
  }

  return "bg-[#f4f4f4] text-[#666666]";
}

/** Short human countdown like "3d 4h", "5h 12m", or "Closing soon". */
export function formatCountdown(targetIso: string, now = Date.now()) {
  const diffMs = new Date(targetIso).getTime() - now;

  if (Number.isNaN(diffMs)) {
    return null;
  }

  if (diffMs <= 0) {
    return null;
  }

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return "Closing soon";
}

export function formatRaffleDate(iso: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}
