"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "streetz_access_token";

function PaymentCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Verifying your payment...");

  useEffect(() => {
    const reference = searchParams.get("reference") ?? searchParams.get("trxref");
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!reference) {
      window.setTimeout(() => setMessage("Payment reference was not returned. Please try again."), 0);
      return;
    }

    if (!token) {
      window.setTimeout(() => setMessage("Please log in again so Streetz can verify this payment."), 0);
      return;
    }

    fetch(`${API_URL}/payments/subscription/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reference }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.message ?? "Unable to verify payment.");
        }

        setMessage("Payment verified. Taking you into Streetz...");
        window.setTimeout(() => router.replace("/"), 900);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Unable to verify payment.");
      });
  }, [router, searchParams]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f8f4] px-4 text-[#17211b]">
      <section className="w-full max-w-sm rounded-[8px] border border-[#dfe7dc] bg-white p-6 text-center">
        <p className="text-3xl font-black text-[#0f8f63]">Streetz</p>
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
          <section className="w-full max-w-sm rounded-[8px] border border-[#dfe7dc] bg-white p-6 text-center">
            <p className="text-3xl font-black text-[#0f8f63]">Streetz</p>
            <p className="mt-3 text-sm font-bold text-[#667369]">Loading payment status...</p>
          </section>
        </main>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}
