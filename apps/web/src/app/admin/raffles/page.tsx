"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { AdminRafflesTab } from "@/features/raffles/admin-raffles";

export default function AdminRafflesPage() {
  return (
    <AuthenticatedRoute activeTab="events" adminOnly>
      {({ token, user }) => <AdminRafflesTab token={token} user={user} />}
    </AuthenticatedRoute>
  );
}
