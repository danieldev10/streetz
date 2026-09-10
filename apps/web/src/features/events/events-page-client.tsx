"use client";

import dynamic from "next/dynamic";
import { PublicRoute } from "@/components/app/public-route";
import { ListSkeleton } from "@/components/skeletons";
import { MemberEventsTab } from "@/features/events/member-events-tab";
import type { StreetzEvent } from "@/lib/types";

const AdminEventsList = dynamic(
  () => import("@/features/events/admin-events-list").then((module) => module.AdminEventsList),
  {
    loading: () => (
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <ListSkeleton label="Loading event administration" hasAvatar={false} />
      </div>
    ),
  }
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
