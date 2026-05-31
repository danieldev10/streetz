"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { UsersTab } from "@/features/admin/users-tab";

export default function UsersPage() {
  return (
    <AuthenticatedRoute activeTab="users" adminOnly>
      {({ token }) => <UsersTab token={token} />}
    </AuthenticatedRoute>
  );
}
