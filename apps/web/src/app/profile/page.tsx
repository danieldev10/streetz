"use client";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { ProfileTab } from "@/features/profile/profile-tab";

export default function ProfilePage() {
  return (
    <AuthenticatedRoute activeTab="profile">
      {({ token, user }) => <ProfileTab token={token} user={user} />}
    </AuthenticatedRoute>
  );
}
