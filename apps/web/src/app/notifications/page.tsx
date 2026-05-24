"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { NotificationsTab } from "@/features/notifications/notifications-tab";

export default function NotificationsPage() {
  return (
    <AuthenticatedRoute activeTab="notifications">
      {({ token, onMatchCreated, onNotificationsChanged }) => (
        <NotificationsTab
          token={token}
          onMatchCreated={onMatchCreated}
          onNotificationsChanged={onNotificationsChanged}
        />
      )}
    </AuthenticatedRoute>
  );
}
