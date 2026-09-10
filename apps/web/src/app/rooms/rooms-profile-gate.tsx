"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, UserRound } from "lucide-react";
import { RoomsLoadingView } from "@/features/rooms/rooms-loading-view";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { formatProfileSetupIssues, getProfileSetupIssues, isProfileReadyForDiscovery } from "@/lib/profile";
import type { StreetzProfile, StreetzUser } from "@/lib/types";
import { queryKeys } from "@/lib/query-keys";

export function RoomsProfileGate({
  token,
  user,
  children,
}: {
  token: string | null;
  user: StreetzUser | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const shouldCheckProfile = Boolean(token && user && user.role !== "ADMIN");
  const [profileState, setProfileState] = useState<"checking" | "ready" | "required">(() => {
    if (!shouldCheckProfile || !user) return "ready";
    const cachedProfile = queryClient.getQueryData<StreetzProfile | null>(queryKeys.profile(user.id));
    if (cachedProfile === undefined) return "checking";
    return isProfileReadyForDiscovery(cachedProfile) ? "ready" : "required";
  });
  const [profileIssues, setProfileIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkProfile() {
      if (!token || !user || user.role === "ADMIN") {
        setProfileState("ready");
        setProfileIssues([]);
        setNotice(null);
        return;
      }

      const cachedProfile = queryClient.getQueryData<StreetzProfile | null>(queryKeys.profile(user.id));
      const hasReadyProfile = isProfileReadyForDiscovery(cachedProfile);
      if (!hasReadyProfile) setProfileState("checking");
      setNotice(null);

      try {
        const profile = await queryClient.fetchQuery({
          queryKey: queryKeys.profile(user.id),
          queryFn: () => apiRequest<StreetzProfile | null>("/profiles/me", {
            headers: authHeaders(token),
          }),
          staleTime: 5 * 60_000
        });

        if (cancelled) {
          return;
        }

        if (isProfileReadyForDiscovery(profile)) {
          setProfileState("ready");
          setProfileIssues([]);
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
  }, [queryClient, token, user]);

  if (profileState === "ready") {
    return <>{children}</>;
  }

  if (profileState === "checking") {
    return <RoomsLoadingView label="Checking profile" />;
  }

  return (
    <section>
      <div className="px-5 pb-8 pt-6 md:px-8 md:pt-8">
        <article className="grid min-h-90 place-items-center rounded-[28px] border border-black/[0.05] bg-surface p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
          <div className="max-w-xs">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-tint text-success">
              <MessageCircle className="size-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-ink">Complete your profile</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Rooms are available after you {formatProfileSetupIssues(profileIssues)}.
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
      </div>
    </section>
  );
}
