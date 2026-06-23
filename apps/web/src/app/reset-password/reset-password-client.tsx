"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, LockKeyhole } from "lucide-react";
import { apiRequest, getUserErrorMessage } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth-constraints";

function getPasswordValidationMessage(password: string, confirmPassword: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
}

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(token ? null : "Password reset token is missing.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!token) {
      setMessage("Password reset token is missing.");
      return;
    }

    const validationMessage = getPasswordValidationMessage(password, confirmPassword);

    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      await apiRequest<{ reset: boolean }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });

      setPassword("");
      setConfirmPassword("");
      router.replace("/?passwordReset=1");
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
            <LockKeyhole className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold">Choose a new password</h1>
          <p className="mt-2 text-sm leading-6 text-[#666666]">
            Use a new password that is at least {PASSWORD_MIN_LENGTH} characters.
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            New password
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Confirm password
            <input
              className="h-12 rounded-full border border-black/8 px-4 text-sm outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </label>

          {message ? <p className="rounded-2xl bg-[#fff8e9] p-3 text-sm font-medium text-[#8a5a08]">{message}</p> : null}

          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !token}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save password
          </button>
        </form>
      </section>
    </main>
  );
}
