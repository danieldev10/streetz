"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, LoaderCircle, Mail } from "lucide-react";
import { apiRequest, getUserErrorMessage } from "@/lib/api";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setResetUrl(null);

    if (!isValidEmail(email)) {
      setMessage("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiRequest<{ message: string; resetUrl?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });

      setMessage(response.message);
      setResetUrl(response.resetUrl ?? null);
    } catch (error) {
      setMessage(getUserErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-8 text-[#0d0d0d]">
      <section className="w-full max-w-sm rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <Link
          className="inline-flex size-10 items-center justify-center rounded-full border border-black/8"
          href="/"
          aria-label="Back to login"
          title="Back"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>

        <div className="mt-8 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#fafafa]">
            <Mail className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold">Reset password</h1>
          <p className="mt-2 text-sm leading-6 text-[#666666]">
            Enter your email and we will send a password reset link if the account exists.
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            Email
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          {message ? <p className="rounded-2xl bg-[#fff8e9] p-3 text-sm font-medium text-[#8a5a08]">{message}</p> : null}

          {resetUrl ? (
            <Link className="rounded-2xl bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]" href={resetUrl}>
              Open development reset link
            </Link>
          ) : null}

          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Send reset link
          </button>
        </form>
      </section>
    </main>
  );
}
