"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Gift, LoaderCircle, Minus, Plus, Ticket, Trophy } from "lucide-react";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { AuthPromptKind } from "@/components/app/public-route";
import { LoadingState } from "@/components/loading-state";
import type { MyRaffleEntries, StreetzRaffle, StreetzUser } from "@/lib/types";
import { formatCountdown, formatRaffleDate, formatRafflePrice, getRaffleStatusLabel, getRaffleStatusTone } from "./raffle-format";

const RAFFLE_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=900&q=80";
const MAX_TICKETS_PER_PURCHASE = 100;

export function RaffleDetail({
  token,
  user,
  raffleId,
  onAuthRequired
}: {
  token: string | null;
  user: StreetzUser | null;
  raffleId: string;
  onAuthRequired: (kind?: AuthPromptKind) => void;
}) {
  const [raffle, setRaffle] = useState<StreetzRaffle | null>(null);
  const [myEntries, setMyEntries] = useState<MyRaffleEntries | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [raffleResponse, entriesResponse] = await Promise.all([
          apiRequest<StreetzRaffle>(`/raffles/${raffleId}`, { headers: authHeaders(token) }),
          apiRequest<MyRaffleEntries>(`/raffles/${raffleId}/entries`, { headers: authHeaders(token) })
        ]);
        if (!cancelled) {
          setRaffle(raffleResponse);
          setMyEntries(entriesResponse);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(getUserErrorMessage(caught));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [raffleId, token]);

  async function buyTickets() {
    if (!token) {
      onAuthRequired("eventTicket");
      return;
    }

    setIsBuying(true);
    setError(null);

    try {
      const response = await apiRequest<{ authorizationUrl?: string }>(`/payments/raffles/${raffleId}/checkout/initialize`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ quantity })
      });

      if (!response.authorizationUrl) {
        throw new Error("Unable to start raffle checkout right now.");
      }

      window.location.assign(response.authorizationUrl);
    } catch (caught) {
      setError(getUserErrorMessage(caught));
      setIsBuying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-5 pb-24 pt-6 md:px-8 md:pb-8">
        <LoadingState label="Loading raffle" className="min-h-90 rounded-3xl border border-black/5" />
      </div>
    );
  }

  if (!token) {
    return (
      <RaffleMessage
        title="Members only"
        body="Sign in with your crushclub membership to enter this raffle."
        action={
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[#0d0d0d] px-6 text-sm font-medium text-white"
            onClick={() => onAuthRequired("eventTicket")}
          >
            Sign in
          </button>
        }
      />
    );
  }

  if (error && !raffle) {
    return <RaffleMessage title="Raffle unavailable" body={error} action={<BackToEvents />} />;
  }

  if (!raffle) {
    return <RaffleMessage title="Raffle not found" body="This raffle may have been removed." action={<BackToEvents />} />;
  }

  const details = raffle.raffle;
  const image = details.prize.image || raffle.coverImage || RAFFLE_FALLBACK_IMAGE;
  const isSelling = details.status === "SELLING";
  const totalKobo = details.ticketPriceKobo * quantity;
  const youWon = details.status === "DRAWN" && details.winner?.userId === user?.id;

  return (
    <div className="px-5 pb-28 pt-6 md:px-8 md:pb-10">
      <Link href="/events" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#666666] hover:text-[#0d0d0d]">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to events
      </Link>

      <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <div className="relative aspect-16/10 bg-[#f6e0f6] md:aspect-21/9">
          <Image src={image} alt={details.prize.title} fill sizes="(max-width: 768px) 100vw, 900px" className="object-cover" priority />
          <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold ${getRaffleStatusTone(details.status)}`}>
            {getRaffleStatusLabel(details.status)}
          </span>
        </div>

        <div className="p-5 md:p-6">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#bd40be]">
            <Trophy className="size-3.5" aria-hidden="true" />
            {details.prize.category || "Raffle prize"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight text-[#0d0d0d] md:text-4xl">{details.prize.title}</h1>
          <p className="mt-1 text-sm font-medium text-[#666666]">{raffle.title}</p>
          {details.prize.description ? (
            <p className="mt-3 text-sm leading-6 text-[#444444]">{details.prize.description}</p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Per ticket" value={formatRafflePrice(details.ticketPriceKobo)} />
            <Stat label="Tickets sold" value={String(details.ticketsSold)} />
            <Stat label="Your tickets" value={String(myEntries?.count ?? details.yourEntryCount)} />
            <Stat label="Draw date" value={formatRaffleDate(details.drawsAt)} small />
          </div>

          {details.status === "DRAWN" ? (
            <WinnerPanel raffle={raffle} youWon={youWon} winningNumber={myEntries?.winningNumber ?? null} />
          ) : details.status === "CANCELLED" ? (
            <Banner tone="error">This raffle was cancelled.{raffle.cancellationReason ? ` ${raffle.cancellationReason}` : ""}</Banner>
          ) : details.status === "SCHEDULED" ? (
            <Banner tone="muted">
              <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
              Ticket sales open {formatRaffleDate(details.salesStartsAt)}.
            </Banner>
          ) : details.status === "SALES_CLOSED" ? (
            <Banner tone="muted">
              <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
              Sales have closed. The winner will be drawn {formatRaffleDate(details.drawsAt)}.
            </Banner>
          ) : null}

          {isSelling ? (
            <div className="mt-6 rounded-[20px] border border-black/5 bg-[#fbf7fb] p-4">
              {formatCountdown(details.salesEndsAt) ? (
                <p className="text-xs font-medium text-[#7c1f7d]">Sales close in {formatCountdown(details.salesEndsAt)}</p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-[#0d0d0d]">Quantity</span>
                <div className="inline-flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex size-9 items-center justify-center rounded-full border border-black/10 text-[#0d0d0d] disabled:opacity-40"
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                    disabled={quantity <= 1 || isBuying}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    className="inline-flex size-9 items-center justify-center rounded-full border border-black/10 text-[#0d0d0d] disabled:opacity-40"
                    onClick={() => setQuantity((current) => Math.min(MAX_TICKETS_PER_PURCHASE, current + 1))}
                    disabled={quantity >= MAX_TICKETS_PER_PURCHASE || isBuying}
                    aria-label="Increase quantity"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#9d2a9e] px-5 text-sm font-medium text-white transition hover:bg-[#7c1f7d] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void buyTickets()}
                disabled={isBuying}
              >
                {isBuying ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                Buy {quantity} {quantity === 1 ? "ticket" : "tickets"} · {formatRafflePrice(totalKobo)}
              </button>
            </div>
          ) : null}

          {error ? <Banner tone="error">{error}</Banner> : null}

          {myEntries && myEntries.entries.length > 0 ? (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-[#0d0d0d]">Your ticket numbers</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {myEntries.entries.map((entry) => {
                  const isWinning = details.status === "DRAWN" && myEntries.winningNumber === entry.number;
                  return (
                    <span
                      key={entry.id}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
                        isWinning ? "bg-[#d4fae8] text-[#0b7a50]" : "bg-[#f6e0f6] text-[#7c1f7d]"
                      }`}
                    >
                      #{String(entry.number).padStart(5, "0")}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WinnerPanel({ raffle, youWon, winningNumber }: { raffle: StreetzRaffle; youWon: boolean; winningNumber: number | null }) {
  const winner = raffle.raffle.winner;

  return (
    <div className={`mt-6 rounded-[20px] border p-5 text-center ${youWon ? "border-[#0b7a50]/30 bg-[#d4fae8]" : "border-black/5 bg-[#fbf7fb]"}`}>
      <Gift className={`mx-auto size-8 ${youWon ? "text-[#0b7a50]" : "text-[#bd40be]"}`} aria-hidden="true" />
      <h2 className="mt-2 text-xl font-semibold text-[#0d0d0d]">{youWon ? "You won! 🎉" : "Winner announced"}</h2>
      {winner ? (
        <p className="mt-1 text-sm text-[#444444]">
          Winning ticket <span className="font-semibold">#{String(winner.number).padStart(5, "0")}</span>
          {youWon ? null : ` · ${winner.displayName}`}
        </p>
      ) : null}
      {youWon && winningNumber ? (
        <p className="mt-2 text-sm font-medium text-[#0b7a50]">We&apos;ll reach out about claiming your prize.</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[#fafafa] p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#888888]">{label}</p>
      <p className={`mt-1 font-semibold text-[#0d0d0d] ${small ? "text-xs leading-4" : "text-base"}`}>{value}</p>
    </div>
  );
}

function Banner({ tone, children }: { tone: "muted" | "error"; children: React.ReactNode }) {
  const toneClass = tone === "error" ? "bg-[#fdecec] text-[#b3261e]" : "bg-[#f4f4f4] text-[#666666]";

  return <div className={`mt-4 flex items-center gap-2 rounded-2xl p-3 text-sm font-medium ${toneClass}`}>{children}</div>;
}

function BackToEvents() {
  return (
    <Link href="/events" className="inline-flex h-12 items-center justify-center rounded-full bg-[#0d0d0d] px-6 text-sm font-medium text-white">
      Back to events
    </Link>
  );
}

function RaffleMessage({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="px-5 pb-24 pt-6 md:px-8 md:pb-8">
      <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-[#0d0d0d]">{title}</h1>
          <p className="mt-2 text-sm text-[#666666]">{body}</p>
          <div className="mt-5">{action}</div>
        </div>
      </div>
    </div>
  );
}
