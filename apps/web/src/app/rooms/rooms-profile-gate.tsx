"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, UserRound } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { formatProfileSetupIssues, getProfileSetupIssues, isProfileReadyForDiscovery } from "@/lib/profile";
import type { StreetzProfile, StreetzUser } from "@/lib/types";

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
  const shouldCheckProfile = Boolean(token && user && user.role !== "ADMIN");
  const [profileState, setProfileState] = useState<"checking" | "ready" | "required">(
    shouldCheckProfile ? "checking" : "ready"
  );
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
  }, [token, user]);

  if (profileState === "ready") {
    return <>{children}</>;
  }

  return (
    <section>
      <ScreenHeader eyebrow="Rooms" title="" />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {profileState === "checking" ? (
          <LoadingState label="Checking profile" className="min-h-90 rounded-[28px] border border-black/[0.05] bg-white p-6" />
        ) : (
          <article className="grid min-h-90 place-items-center rounded-[28px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
            <div className="max-w-xs">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#e7f8ef] text-[#0fa76e]">
                <MessageCircle className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-[#0d0d0d]">Complete your profile</h2>
              <p className="mt-2 text-sm leading-6 text-[#666666]">
                Rooms are available after you {formatProfileSetupIssues(profileIssues)}.
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
