"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { MatchesTab } from "@/features/matches/matches-tab";

export default function MatchThreadPage() {
  const params = useParams<{ matchId: string }>();

  return (
    <AuthenticatedRoute activeTab="matches">
      {({ token, user, onMatchesLoaded, onMatchOpened, onNotificationsChanged }) => (
        <MatchesTab
          token={token}
          user={user}
          initialSelectedMatchId={params.matchId}
          onMatchesLoaded={onMatchesLoaded}
          onMatchOpened={onMatchOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
