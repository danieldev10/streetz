"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, ShieldCheck, UserRound } from "lucide-react";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { DiscoveryLoadingView } from "@/features/discovery/discovery-loading-view";
import { DiscoveryTab } from "@/features/discovery/discovery-tab";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { formatProfileSetupIssues, getProfileSetupIssues, isProfileReadyForDiscovery } from "@/lib/profile";
import { queryKeys } from "@/lib/query-keys";
import type { FaceVerificationState, StreetzProfile, StreetzUser } from "@/lib/types";

type GateState = "checking" | "ready" | "required" | "verificationRequired";

type ResolvedGate = {
  state: GateState;
  profile: StreetzProfile | null;
  issues: string[];
};

/**
 * Works out the gate state from whatever is already cached. Returns null when a
 * request is still needed, so a warm cache renders the tab without a loading pass.
 */
function resolveFromCache(
  profile: StreetzProfile | null | undefined,
  verification: FaceVerificationState | undefined
): ResolvedGate | null {
  if (profile === undefined) {
    return null;
  }

  if (!isProfileReadyForDiscovery(profile)) {
    return { state: "required", profile: null, issues: getProfileSetupIssues(profile) };
  }

  if (verification === undefined) {
    return null;
  }

  return {
    state: verification.required && verification.status !== "VERIFIED" ? "verificationRequired" : "ready",
    profile,
    issues: [],
  };
}

function DiscoveryProfileGate({
  token,
  user,
  onConversationChanged,
}: {
  token: string;
  user: StreetzUser;
  onConversationChanged: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const initial = resolveFromCache(
    queryClient.getQueryData<StreetzProfile | null>(queryKeys.profile(user.id)),
    queryClient.getQueryData<FaceVerificationState>(queryKeys.verification(user.id))
  );
  const [profileState, setProfileState] = useState<GateState>(initial?.state ?? "checking");
  const [readyProfile, setReadyProfile] = useState<StreetzProfile | null>(initial?.profile ?? null);
  const [profileIssues, setProfileIssues] = useState<string[]>(initial?.issues ?? []);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkProfile() {
      setNotice(null);

      try {
        // Shares MemberApp's query key, so the two mounts dedupe into one request.
        const profile = await queryClient.fetchQuery({
          queryKey: queryKeys.profile(user.id),
          queryFn: () => apiRequest<StreetzProfile | null>("/profiles/me", {
            headers: authHeaders(token),
          }),
          staleTime: 5 * 60_000,
        });

        if (cancelled) {
          return;
        }

        if (isProfileReadyForDiscovery(profile)) {
          const verification = await queryClient.fetchQuery({
            queryKey: queryKeys.verification(user.id),
            queryFn: () => apiRequest<FaceVerificationState>("/verification/me", {
              headers: authHeaders(token),
            }),
            staleTime: 5 * 60_000,
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
  }, [queryClient, token, user.id]);

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
        profile={readyProfile!}
        onConversationChanged={onConversationChanged}
      />
    );
  }

  if (profileState === "checking") {
    return <DiscoveryLoadingView label="Checking profile" />;
  }

  return (
    <section>
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        {profileState === "verificationRequired" ? (
          <article className="grid min-h-90 place-items-center rounded-[28px] border border-black/[0.05] bg-surface p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="max-w-xs">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-tint text-brand-strong">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-ink">Verify your profile</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Discover is available after a quick live selfie check.
              </p>
              {notice ? <p className="mt-3 rounded-2xl bg-danger-tint p-3 text-sm font-medium text-danger">{notice}</p> : null}
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white"
                type="button"
                onClick={() => router.push("/profile/verify?next=/discover")}
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Verify now
              </button>
            </div>
          </article>
        ) : (
          <article className="grid min-h-90 place-items-center rounded-[28px] border border-black/[0.05] bg-surface p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="max-w-xs">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-tint text-brand-strong">
                <Heart className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-ink">Complete your profile</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Discover is available after you {formatProfileSetupIssues(profileIssues)}.
              </p>
              {notice ? <p className="mt-3 rounded-2xl bg-danger-tint p-3 text-sm font-medium text-danger">{notice}</p> : null}
              <button
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white"
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
      {({ token, user, onMatchCreated }) => (
        <DiscoveryProfileGate token={token} user={user} onConversationChanged={onMatchCreated} />
      )}
    </AuthenticatedRoute>
  );
}
