"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Amplify } from "aws-amplify";
import { FaceLivenessDetector } from "@aws-amplify/ui-react-liveness";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { LoadingState } from "@/components/loading-state";
import { ScreenHeader } from "@/components/app/navigation";
import { useSession } from "@/components/app/session-provider";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { FaceVerificationState } from "@/lib/types";

type LivenessSession = {
  attemptId: string;
  sessionId: string;
  region: string;
};

type CompletionResult = {
  status: FaceVerificationState["status"];
  effectiveStatus: FaceVerificationState["status"] | null;
  livenessConfidence: number | null;
  faceMatchSimilarity: number | null;
  failureReason: string | null;
  overrideReason: string | null;
  verified: boolean;
};

let isAmplifyConfigured = false;

function configureAmplifyForLiveness() {
  if (isAmplifyConfigured) {
    return true;
  }

  const identityPoolId = process.env.NEXT_PUBLIC_AWS_LIVENESS_IDENTITY_POOL_ID;

  if (!identityPoolId) {
    return false;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        identityPoolId,
        allowGuestAccess: true
      }
    }
  });
  isAmplifyConfigured = true;

  return true;
}

function FaceVerificationContent({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshSession } = useSession();
  const nextPath = useMemo(() => searchParams.get("next") || "/profile", [searchParams]);
  const [state, setState] = useState<FaceVerificationState | null>(null);
  const [livenessSession, setLivenessSession] = useState<LivenessSession | null>(null);
  const [result, setResult] = useState<CompletionResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadVerification() {
      setIsLoadingState(true);
      setNotice(null);

      try {
        const verification = await apiRequest<FaceVerificationState>("/verification/me", {
          headers: authHeaders(token)
        });

        if (!cancelled) {
          setState(verification);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice(getUserErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingState(false);
        }
      }
    }

    void loadVerification();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function startVerification() {
    setNotice(null);
    setResult(null);

    if (!configureAmplifyForLiveness()) {
      setNotice("Face verification is missing the Cognito identity pool configuration.");
      return;
    }

    setIsStarting(true);

    try {
      const session = await apiRequest<LivenessSession>("/verification/face-liveness/session", {
        method: "POST",
        headers: authHeaders(token)
      });

      setLivenessSession(session);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function completeVerification() {
    if (!livenessSession || isCompleting) {
      return;
    }

    setIsCompleting(true);
    setNotice(null);

    try {
      const completion = await apiRequest<CompletionResult>("/verification/face-liveness/result", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ attemptId: livenessSession.attemptId })
      });
      const verification = await apiRequest<FaceVerificationState>("/verification/me", {
        headers: authHeaders(token)
      });

      setResult(completion);
      setState(verification);
      setLivenessSession(null);
      await refreshSession({ force: true });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsCompleting(false);
    }
  }

  const isVerified = state?.status === "VERIFIED" || result?.verified;
  const canContinue = Boolean(state && (isVerified || !state.required));

  return (
    <section>
      <div className="px-5 pt-5 md:px-8 md:pt-8">
        <button
          className="inline-flex size-10 items-center justify-center rounded-full border border-black/8 bg-white text-[#0d0d0d]"
          onClick={() => router.push("/profile")}
          aria-label="Back to profile"
          title="Back"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ScreenHeader eyebrow="Verification" title="" />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className="mx-auto max-w-130">
          {notice ? <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-600">{notice}</p> : null}

          {isLoadingState ? (
            <LoadingState label="Checking verification" className="min-h-105 rounded-[28px] border border-black/5 bg-white p-6" />
          ) : livenessSession ? (
            <article className="overflow-hidden rounded-[28px] border border-black/5 bg-white p-3 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              <FaceLivenessDetector
                sessionId={livenessSession.sessionId}
                region={livenessSession.region}
                onAnalysisComplete={async () => {
                  await completeVerification();
                }}
                onError={() => {
                  setNotice("Face verification failed. Please try again.");
                  setLivenessSession(null);
                }}
              />
              {isCompleting ? (
                <div className="p-4 text-center text-sm font-medium text-[#666666]">
                  <LoaderCircle className="mx-auto mb-2 size-5 animate-spin text-[#18E299]" aria-hidden="true" />
                  Saving verification result
                </div>
              ) : null}
            </article>
          ) : (
            <article className="rounded-[28px] border border-black/5 bg-white p-5 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
              <div className={`mx-auto grid size-16 place-items-center rounded-full ${isVerified ? "bg-[#d4fae8] text-[#0fa76e]" : "bg-[#fafafa] text-[#0d0d0d]"}`}>
                {isVerified ? <CheckCircle2 className="size-7" aria-hidden="true" /> : <ShieldCheck className="size-7" aria-hidden="true" />}
              </div>
              <h1 className="mt-4 text-2xl font-semibold text-[#0d0d0d]">
                {isVerified ? "Profile verified" : "Live selfie verification"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#666666]">
                {state?.enabled
                  ? "We compare a live selfie with your profile photos to reduce fake profiles and impersonation."
                  : "Face verification is set up, but it is currently disabled for this prototype."}
              </p>

              {state?.mode === "prototype-pass" || result?.overrideReason ? (
                <div className="mt-4 rounded-[18px] bg-[#fff7df] p-3 text-left text-sm leading-6 text-[#8a5b00]">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p>
                      Prototype mode is active. The real AWS result is saved, but completed checks are treated as verified for testing.
                    </p>
                  </div>
                </div>
              ) : null}

              {result ? (
                <div className="mt-4 grid gap-2 rounded-[18px] bg-[#fafafa] p-3 text-left text-xs font-medium text-[#666666]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Real result</span>
                    <span className="text-[#0d0d0d]">{result.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Liveness</span>
                    <span className="text-[#0d0d0d]">{result.livenessConfidence === null ? "N/A" : `${result.livenessConfidence.toFixed(1)}%`}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Face match</span>
                    <span className="text-[#0d0d0d]">{result.faceMatchSimilarity === null ? "N/A" : `${result.faceMatchSimilarity.toFixed(1)}%`}</span>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                {state?.enabled && !isVerified ? (
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => void startVerification()}
                    disabled={isStarting}
                  >
                    {isStarting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
                    Start live selfie
                  </button>
                ) : null}
                <button
                  className="inline-flex h-12 items-center justify-center rounded-full border border-black/8 bg-white px-5 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={!canContinue}
                  onClick={() => router.replace(nextPath)}
                >
                  Continue
                </button>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function VerifyPageContent() {
  return (
    <AuthenticatedRoute activeTab="profile">
      {({ token }) => <FaceVerificationContent token={token} />}
    </AuthenticatedRoute>
  );
}

export default function VerifyProfilePage() {
  return (
    <Suspense fallback={null}>
      <VerifyPageContent />
    </Suspense>
  );
}
