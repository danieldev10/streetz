"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { MatchesTab } from "@/features/matches/matches-tab";

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();

  return (
    <AuthenticatedRoute activeTab="matches">
      {({ token, user, cachedMatches, onMatchesLoaded, onMatchOpened, onNotificationsChanged }) => (
        <MatchesTab
          key={params.conversationId}
          token={token}
          user={user}
          initialMatches={cachedMatches}
          initialSelectedMatchId={params.conversationId}
          onMatchesLoaded={onMatchesLoaded}
          onMatchOpened={onMatchOpened}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
