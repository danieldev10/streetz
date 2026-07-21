"use client";

import { PublicRoute } from "@/components/app/public-route";
import { RaffleDetail } from "@/features/raffles/raffle-detail";
import type { StreetzRaffle } from "@/lib/types";

export function RafflePageClient({ raffleId, initialRaffle }: { raffleId: string; initialRaffle?: StreetzRaffle | null }) {
  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => (
        <RaffleDetail token={token} user={user} raffleId={raffleId} initialRaffle={initialRaffle} onAuthRequired={requestAuth} />
      )}
    </PublicRoute>
  );
}
