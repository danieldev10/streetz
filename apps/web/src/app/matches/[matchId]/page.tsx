"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { MatchesTab } from "@/features/matches/matches-tab";

export default function MatchThreadPage() {
  const params = useParams<{ matchId: string }>();

  return (
    <AuthenticatedRoute activeTab="matches">
      {({ token, user, cachedMatches, onMatchesLoaded, onMatchOpened, onNotificationsChanged }) => (
        <MatchesTab
          key={params.matchId}
          token={token}
          user={user}
          initialMatches={cachedMatches}
          initialSelectedMatchId={params.matchId}
          onMatchesLoaded={onMatchesLoaded}
          onMatchOpened={onMatchOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
