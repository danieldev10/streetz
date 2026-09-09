"use client";

import dynamic from "next/dynamic";
import { PublicRoute } from "@/components/app/public-route";
import { LoadingState } from "@/components/loading-state";
import { MemberEventsTab } from "@/features/events/member-events-tab";
import type { StreetzEvent } from "@/lib/types";

const AdminEventsList = dynamic(
  () => import("@/features/events/admin-events-list").then((module) => module.AdminEventsList),
  { loading: () => <LoadingState label="Loading event administration" className="min-h-[70vh]" /> }
);

export function EventsPageClient({ initialEvents }: {
  initialEvents?: StreetzEvent[];
}) {
  return (
    <PublicRoute activeTab="events">
      {({ token, user, requestAuth }) => token && user?.role === "ADMIN" ? (
        <AdminEventsList token={token} />
      ) : (
        <MemberEventsTab
          token={token}
          user={user}
          initialEvents={initialEvents}
          onAuthRequired={requestAuth}
        />
      )}
    </PublicRoute>
  );
}
