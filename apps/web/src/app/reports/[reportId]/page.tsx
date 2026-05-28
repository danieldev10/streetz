"use client";

import { useParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { ReportDetail } from "@/features/admin/reports-tab";

export default function ReportDetailPage() {
  const params = useParams<{ reportId: string }>();

  return (
    <AuthenticatedRoute activeTab="reports" adminOnly>
      {({ token }) => <ReportDetail key={params.reportId} token={token} reportId={params.reportId} />}
    </AuthenticatedRoute>
  );
}
