"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeletons";
import { SupportTab } from "@/features/admin/support-tab";

export default function AdminSupportPage() {
  return (
    <AuthenticatedRoute activeTab="support" adminOnly>
      {({ token }) => (
        <Suspense fallback={<div className="p-5"><ListSkeleton label="Loading support requests" /></div>}>
          <SupportTab token={token} />
        </Suspense>
      )}
    </AuthenticatedRoute>
  );
}
