"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { MatchesTab } from "@/features/matches/matches-tab";

export default function MatchesPage() {
  return (
    <AuthenticatedRoute activeTab="matches">
      {({ token, user, onMatchesLoaded, onMatchOpened, onNotificationsChanged }) => (
        <MatchesTab
          token={token}
          user={user}
          onMatchesLoaded={onMatchesLoaded}
          onMatchOpened={onMatchOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
