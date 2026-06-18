"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ShieldCheck, UserRound } from "lucide-react";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { LoadingState } from "@/components/loading-state";
import { ScreenHeader } from "@/components/app/navigation";
import { DiscoveryTab } from "@/features/discovery/discovery-tab";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { formatProfileSetupIssues, getProfileSetupIssues, isProfileReadyForDiscovery } from "@/lib/profile";
import type { FaceVerificationState, StreetzProfile } from "@/lib/types";

function DiscoveryProfileGate({
  token,
  onMatchCreated,
}: {
  token: string;
  onMatchCreated: () => void;
}) {
  const router = useRouter();
  const [profileState, setProfileState] = useState<"checking" | "ready" | "required" | "verificationRequired">("checking");
  const [readyProfile, setReadyProfile] = useState<StreetzProfile | null>(null);
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
          const verification = await apiRequest<FaceVerificationState>("/verification/me", {
            headers: authHeaders(token),
          });

          if (cancelled) {
            return;
          }

          setReadyProfile(profile);
          setProfileIssues([]);
          setProfileState(verification.required && verification.status !== "VERIFIED" ? "verificationRequired" : "ready");
          return;
        }

        setReadyProfile(null);
        setProfileIssues(getProfileSetupIssues(profile));
        setProfileState("required");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setNotice(getUserErrorMessage(error));
        setReadyProfile(null);
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
    return (
      <DiscoveryTab
        key={[
          readyProfile?.id ?? "profile",
          readyProfile?.connectionStatus ?? "none",
          readyProfile?.gender ?? "no-gender",
          readyProfile?.sexuality ?? "no-sexuality",
        ].join(":")}
        token={token}
        onMatchCreated={onMatchCreated}
        initialConnectionStatus={readyProfile?.connectionStatus ?? null}
        initialGender={readyProfile?.gender ?? null}
        initialSexuality={readyProfile?.sexuality ?? null}
      />
    );
  }

  return (
    <section>
      <ScreenHeader eyebrow="Discovery" title="" />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {profileState === "checking" ? (
          <LoadingState label="Checking profile" className="min-h-90 rounded-[28px] border border-black/[0.05] bg-white p-6" />
        ) : profileState === "verificationRequired" ? (
          <article className="grid min-h-90 place-items-center rounded-[28px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="max-w-xs">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#d4fae8] text-[#0fa76e]">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-[#0d0d0d]">Verify your profile</h2>
              <p className="mt-2 text-sm leading-6 text-[#666666]">
                Discover is available after a quick live selfie check.
              </p>
              {notice ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-600">{notice}</p> : null}
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
                type="button"
                onClick={() => router.push("/profile/verify?next=/discover")}
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Verify now
              </button>
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
