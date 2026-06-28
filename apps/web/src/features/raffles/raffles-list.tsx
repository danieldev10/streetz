"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Gift, Ticket, Trophy } from "lucide-react";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { StreetzRaffle } from "@/lib/types";
import { LoadingState } from "@/components/loading-state";
import { formatCountdown, formatRafflePrice, getRaffleStatusLabel, getRaffleStatusTone } from "./raffle-format";

const RAFFLE_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=900&q=80";

export function RafflesList({ token }: { token: string | null }) {
  const [raffles, setRaffles] = useState<StreetzRaffle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const path = token ? "/raffles" : "/public/raffles";
        const response = await apiRequest<{ raffles: StreetzRaffle[] }>(path, {
          headers: token ? authHeaders(token) : undefined
        });
        if (!cancelled) {
          setRaffles(response.raffles);
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
  }, [token, reloadKey]);

  if (isLoading) {
    return <LoadingState label="Loading raffles" className="min-h-90 rounded-3xl border border-black/5" />;
  }

  if (error) {
    return (
      <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
        <div>
          <p className="text-sm font-medium text-[#b3261e]">{error}</p>
          <button
            type="button"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (raffles.length === 0) {
    return (
      <div className="grid min-h-90 place-items-center rounded-3xl border border-black/5 p-6 text-center">
        <div>
          <Gift className="mx-auto size-8 text-[#bd40be]" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-semibold">No raffles yet</h2>
          <p className="mt-2 text-sm text-[#666666]">Raffle draws for cars, appliances, and more will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {raffles.map((raffle) => (
        <RaffleCard key={raffle.id} raffle={raffle} />
      ))}
    </div>
  );
}

function RaffleCard({ raffle }: { raffle: StreetzRaffle }) {
  const { raffle: details } = raffle;
  const image = details.prize.image || raffle.coverImage || RAFFLE_FALLBACK_IMAGE;
  const countdown =
    details.status === "SELLING"
      ? formatCountdown(details.salesEndsAt)
      : details.status === "SCHEDULED"
        ? formatCountdown(details.salesStartsAt)
        : null;
  const countdownLabel = details.status === "SCHEDULED" ? "Opens in" : "Closes in";

  return (
    <Link
      href={`/events/raffles/${raffle.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)] transition hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
    >
      <div className="relative aspect-16/10 bg-[#f6e0f6]">
        <Image src={image} alt={details.prize.title} fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
        <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${getRaffleStatusTone(details.status)}`}>
          {getRaffleStatusLabel(details.status)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#bd40be]">
          <Trophy className="size-3.5" aria-hidden="true" />
          {details.prize.category || "Raffle prize"}
        </p>
        <h3 className="mt-1 text-lg font-semibold leading-tight text-[#0d0d0d]">{details.prize.title}</h3>
        <p className="mt-0.5 truncate text-sm text-[#666666]">{raffle.title}</p>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#0d0d0d]">
            <Ticket className="size-4 text-[#bd40be]" aria-hidden="true" />
            {formatRafflePrice(details.ticketPriceKobo)}
            <span className="font-normal text-[#888888]">/ ticket</span>
          </span>
          {countdown ? (
            <span className="text-xs font-medium text-[#666666]">
              {countdownLabel} {countdown}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3 text-xs text-[#888888]">
          <span>{details.ticketsSold} sold</span>
          {details.yourEntryCount > 0 ? (
            <span className="font-semibold text-[#7c1f7d]">You have {details.yourEntryCount}</span>
          ) : (
            <span className="font-medium text-[#bd40be] group-hover:underline">View raffle</span>
          )}
        </div>
      </div>
    </Link>
  );
}
