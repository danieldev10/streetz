"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { ReportsTab } from "@/features/admin/reports-tab";

export default function ReportsPage() {
  return (
    <AuthenticatedRoute activeTab="reports" adminOnly>
      {({ token }) => <ReportsTab token={token} />}
    </AuthenticatedRoute>
  );
}
