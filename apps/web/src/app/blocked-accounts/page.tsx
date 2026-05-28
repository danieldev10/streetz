"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { BlockedAccountsTab } from "@/features/blocked-accounts/blocked-accounts-tab";

export default function BlockedAccountsPage() {
  return (
    <AuthenticatedRoute activeTab="blockedAccounts">
      {({ token, refreshNotificationSummary }) => (
        <BlockedAccountsTab token={token} onUnblocked={refreshNotificationSummary} />
      )}
    </AuthenticatedRoute>
  );
}
