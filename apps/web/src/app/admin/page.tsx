"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { AdminDashboard } from "@/features/admin/admin-dashboard";

export default function AdminPage() {
  return (
    <AuthenticatedRoute activeTab="admin" adminOnly>
      {({ token }) => <AdminDashboard token={token} />}
    </AuthenticatedRoute>
  );
}
