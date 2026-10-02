"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { MatchesTab } from "@/features/matches/matches-tab";

export default function MessageRequestsPage() {
  return (
    <AuthenticatedRoute activeTab="matches">
      {({ token, user, cachedMatches, onMatchesLoaded, onMatchOpened, onNotificationsChanged }) => (
        <MatchesTab
          token={token}
          user={user}
          initialMatches={cachedMatches}
          requestView="received"
          onMatchesLoaded={onMatchesLoaded}
          onMatchOpened={onMatchOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
