"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { DiscoveryTab } from "@/features/discovery/discovery-tab";

export default function DiscoverPage() {
  return (
    <AuthenticatedRoute activeTab="discovery">
      {({ token, onMatchCreated }) => <DiscoveryTab token={token} onMatchCreated={onMatchCreated} />}
    </AuthenticatedRoute>
  );
}
