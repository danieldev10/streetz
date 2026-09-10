"use client";

import dynamic from "next/dynamic";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { FormSkeleton } from "@/components/skeletons";

const AdminEventForm = dynamic(
  () => import("@/features/events/admin-event-form").then((module) => module.AdminEventForm),
  {
    loading: () => (
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <FormSkeleton label="Loading event form" fields={6} />
      </div>
    ),
  }
);

export default function CreateEventPage() {
  return (
    <AuthenticatedRoute activeTab="events" adminOnly>
      {({ token }) => <AdminEventForm token={token} mode="create" />}
    </AuthenticatedRoute>
  );
}
