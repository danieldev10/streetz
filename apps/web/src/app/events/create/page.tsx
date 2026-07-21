"use client";

import dynamic from "next/dynamic";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { LoadingState } from "@/components/loading-state";

const AdminEventForm = dynamic(
  () => import("@/features/events/admin-event-form").then((module) => module.AdminEventForm),
  { loading: () => <LoadingState label="Loading event form" className="min-h-[70vh]" /> }
);

export default function CreateEventPage() {
  return (
    <AuthenticatedRoute activeTab="events" adminOnly>
      {({ token, user }) => <AdminEventForm token={token} user={user} mode="create" />}
    </AuthenticatedRoute>
  );
}
