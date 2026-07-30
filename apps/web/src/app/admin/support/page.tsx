"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { SupportTab } from "@/features/admin/support-tab";

export default function AdminSupportPage() {
  return (
    <AuthenticatedRoute activeTab="support" adminOnly>
      {({ token }) => <SupportTab token={token} />}
    </AuthenticatedRoute>
  );
}
