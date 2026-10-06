import { AdminSupportRequestClient } from "@/features/admin/support-request-client";
import { adminSupportQuery, getAdminSupportFilters } from "@/features/admin/support-ui";

export default async function AdminSupportRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  const filters = getAdminSupportFilters({
    get: (key) => typeof query[key] === "string" ? query[key] : null,
  });

  return (
    <AdminSupportRequestClient
      requestId={requestId}
      backHref={`/admin/support${adminSupportQuery(filters)}`}
    />
  );
}
