"use client";

import { useParams } from "next/navigation";
import { PublicRoute } from "@/components/app/public-route";
import { RaffleDetail } from "@/features/raffles/raffle-detail";

export default function RaffleDetailPage() {
  const params = useParams<{ raffleId: string }>();

  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => (
        <RaffleDetail token={token} user={user} raffleId={params.raffleId} onAuthRequired={requestAuth} />
      )}
    </PublicRoute>
  );
}
