"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { ProfileTab } from "@/features/profile/profile-tab";

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSetupMode = searchParams.get("mode") === "setup";

  return (
    <AuthenticatedRoute activeTab="profile">
      {({ token, user }) => (
        <ProfileTab
          token={token}
          user={user}
          mode={isSetupMode ? "setup" : "normal"}
          onProfileReady={isSetupMode ? () => router.replace("/profile/verify?next=/discover") : undefined}
        />
      )}
    </AuthenticatedRoute>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageContent />
    </Suspense>
  );
}
