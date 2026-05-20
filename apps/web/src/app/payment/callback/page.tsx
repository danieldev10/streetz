"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/app/session-provider";
import { TOKEN_KEY, apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";

function PaymentCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, refreshSession, updateSessionUser } = useSession();
  const [message, setMessage] = useState("Verifying your payment...");
  const hasStartedVerification = useRef(false);

  useEffect(() => {
    if (hasStartedVerification.current) {
      return;
    }

    const reference = searchParams.get("reference") ?? searchParams.get("trxref");
    const purpose = searchParams.get("purpose");
    const savedToken = token ?? window.localStorage.getItem(TOKEN_KEY);
    const isEventTicketPayment = purpose === "event-ticket";

    if (!reference) {
      window.setTimeout(() => setMessage("Payment reference was not returned. Please try again."), 0);
      return;
    }

    if (!savedToken) {
      window.setTimeout(() => setMessage("Please log in again so crushclub can verify this payment."), 0);
      return;
    }

    hasStartedVerification.current = true;

    apiRequest<{
      status: string;
      subscriptionStatus?: "INACTIVE" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
      subscriptionEndsAt?: string | null;
    }>(isEventTicketPayment ? "/payments/events/ticket/verify" : "/payments/subscription/verify", {
      method: "POST",
      headers: authHeaders(savedToken),
      body: JSON.stringify({ reference }),
    })
      .then(async (response) => {
        if (!isEventTicketPayment && response.subscriptionStatus) {
          updateSessionUser((current) => ({
            ...current,
            subscriptionStatus: response.subscriptionStatus ?? current.subscriptionStatus,
            subscriptionEndsAt: response.subscriptionEndsAt ?? current.subscriptionEndsAt,
          }));
          await refreshSession({ force: true });
        }

        setMessage(isEventTicketPayment ? "Ticket confirmed. Taking you into crushclub..." : "Payment verified. Taking you into crushclub...");
        window.setTimeout(() => router.replace(isEventTicketPayment ? "/events" : "/discover"), 900);
      })
      .catch((error) => {
        setMessage(getUserErrorMessage(error));
      });
  }, [refreshSession, router, searchParams, token, updateSessionUser]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f8f4] px-4 text-[#17211b]">
      <section className="w-full max-w-sm rounded-lg border border-[#dfe7dc] bg-white p-6 text-center">
        <p className="text-3xl font-black text-[#0f8f63]">crushclub</p>
        <p className="mt-3 text-sm font-bold text-[#667369]">{message}</p>
      </section>
    </main>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-[#f6f8f4] px-4 text-[#17211b]">
          <section className="w-full max-w-sm rounded-lg border border-[#dfe7dc] bg-white p-6 text-center">
            <p className="text-3xl font-black text-[#0f8f63]">crushclub</p>
            <p className="mt-3 text-sm font-bold text-[#667369]">Loading payment status...</p>
          </section>
        </main>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}
