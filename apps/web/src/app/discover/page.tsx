"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, LoaderCircle, UserRound } from "lucide-react";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { ScreenHeader } from "@/components/app/navigation";
import { DiscoveryTab } from "@/features/discovery/discovery-tab";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { formatProfileSetupIssues, getProfileSetupIssues, isProfileReadyForDiscovery } from "@/lib/profile";
import type { StreetzProfile } from "@/lib/types";

function DiscoveryProfileGate({
  token,
  onMatchCreated,
}: {
  token: string;
  onMatchCreated: () => void;
}) {
  const router = useRouter();
  const [profileState, setProfileState] = useState<"checking" | "ready" | "required">("checking");
  const [profileIssues, setProfileIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkProfile() {
      setProfileState("checking");
      setNotice(null);

      try {
        const profile = await apiRequest<StreetzProfile | null>("/profiles/me", {
          headers: authHeaders(token),
        });

        if (cancelled) {
          return;
        }

        if (isProfileReadyForDiscovery(profile)) {
          setProfileIssues([]);
          setProfileState("ready");
          return;
        }

        setProfileIssues(getProfileSetupIssues(profile));
        setProfileState("required");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setNotice(getUserErrorMessage(error));
        setProfileIssues(["set up your profile"]);
        setProfileState("required");
      }
    }

    void checkProfile();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (profileState === "ready") {
    return <DiscoveryTab token={token} onMatchCreated={onMatchCreated} />;
  }

  return (
    <section>
      <ScreenHeader eyebrow="Discovery" title="" />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {profileState === "checking" ? (
          <article className="grid min-h-90 place-items-center rounded-[28px] border border-black/[0.05] bg-white p-6 text-center">
            <div>
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Checking profile</p>
            </div>
          </article>
        ) : (
          <article className="grid min-h-90 place-items-center rounded-[28px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="max-w-xs">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#d4fae8] text-[#0fa76e]">
                <Heart className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-[#0d0d0d]">Complete your profile</h2>
              <p className="mt-2 text-sm leading-6 text-[#666666]">
                Discover is available after you {formatProfileSetupIssues(profileIssues)}.
              </p>
              {notice ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-600">{notice}</p> : null}
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
                type="button"
                onClick={() => router.push("/profile?mode=setup")}
              >
                <UserRound className="size-4" aria-hidden="true" />
                Complete profile
              </button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

export default function DiscoverPage() {
  return (
    <AuthenticatedRoute activeTab="discovery">
      {({ token, onMatchCreated }) => <DiscoveryProfileGate token={token} onMatchCreated={onMatchCreated} />}
    </AuthenticatedRoute>
  );
}
