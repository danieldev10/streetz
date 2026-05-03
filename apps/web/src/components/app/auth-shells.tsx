"use client";

import type { FormEvent } from "react";
import { Heart, LoaderCircle, LogOut, MessageCircle, MessagesSquare, Ticket, UserRound } from "lucide-react";
import type { StreetzUser } from "@/lib/types";

export function CenteredShell({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-[#0d0d0d]">
      <section className="w-full max-w-sm rounded-[24px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <p className="text-3xl font-semibold text-[#0d0d0d]">{title}</p>
        <p className="mt-2 text-sm font-medium text-[#666666]">{subtitle}</p>
      </section>
    </main>
  );
}

type AuthShellProps = {
  authMode: "login" | "register";
  displayName: string;
  email: string;
  password: string;
  message: string | null;
  isSubmitting: boolean;
  onModeChange: (mode: "login" | "register") => void;
  onDisplayNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AuthShell({
  authMode,
  displayName,
  email,
  password,
  message,
  isSubmitting,
  onModeChange,
  onDisplayNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-white text-[#0d0d0d]">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-8 md:grid-cols-[1fr_420px] md:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-black/[0.05] bg-[linear-gradient(180deg,#e8faf1_0%,#f0fdf6_34%,#ffffff_100%)] p-6 shadow-[0_2px_4px_rgba(0,0,0,0.03)] md:p-10">
          <div className="inline-flex rounded-full border border-black/[0.05] bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#0fa76e]">
            Lagos Social Membership
          </div>
          <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight text-[#0d0d0d] md:text-6xl">
            Streetz
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#666666] md:text-lg">
            Discover people, join city rooms, and get tickets to curated Nigerian events.
          </p>
        </div>

        <form onSubmit={onSubmit} className="rounded-[24px] border border-black/[0.05] bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
          <div className="grid grid-cols-2 rounded-full border border-black/[0.05] bg-[#fafafa] p-1 text-sm font-medium">
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${authMode === "login" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => onModeChange("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 ${authMode === "register" ? "bg-[#0d0d0d] text-white" : "text-[#666666]"}`}
              onClick={() => onModeChange("register")}
            >
              Create
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            {authMode === "register" ? (
              <label className="grid gap-2 text-sm font-medium">
                Display name
                <input
                  className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                  value={displayName}
                  onChange={(event) => onDisplayNameChange(event.target.value)}
                  minLength={2}
                  required
                />
              </label>
            ) : null}

            <label className="grid gap-2 text-sm font-medium">
              Email
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                required
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Password
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                minLength={8}
                required
              />
            </label>
          </div>

          {message ? <p className="mt-4 rounded-[16px] bg-[#fff8e9] p-3 text-sm font-medium text-[#8a5a08]">{message}</p> : null}

          <button
            type="submit"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isSubmitting ? "Please wait" : authMode === "register" ? "Create account" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function PaywallShell({
  user,
  message,
  isStartingPayment,
  onStartSubscription,
  onLogout,
}: {
  user: StreetzUser;
  message: string | null;
  isStartingPayment: boolean;
  onStartSubscription: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-8 text-[#0d0d0d]">
      <section className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <div className="bg-[linear-gradient(180deg,#e8faf1_0%,#ffffff_100%)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold">Streetz</p>
              <p className="mt-2 text-sm font-medium text-[#666666]">{user.displayName}</p>
            </div>
            <button
              className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#0d0d0d]"
              onClick={onLogout}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
          <h1 className="mt-10 text-3xl font-semibold leading-tight md:text-5xl">Unlock Streetz for ₦1,000/month.</h1>
        </div>

        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Discovery", icon: Heart },
              { label: "Matches", icon: MessagesSquare },
              { label: "Profile", icon: UserRound },
              { label: "Rooms", icon: MessageCircle },
              { label: "Events", icon: Ticket },
            ].map((item) => (
              <div key={item.label} className="rounded-[16px] border border-black/[0.05] p-4">
                <item.icon className="size-5 text-[#0fa76e]" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">{item.label}</p>
              </div>
            ))}
          </div>

          {message ? <p className="mt-4 rounded-[16px] bg-[#fff8e9] p-3 text-sm font-medium text-[#8a5a08]">{message}</p> : null}

          <button
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#18E299] px-5 text-sm font-medium text-[#0d0d0d] shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onStartSubscription}
            disabled={isStartingPayment}
          >
            {isStartingPayment ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isStartingPayment ? "Opening Paystack" : "Pay with Paystack"}
          </button>
        </div>
      </section>
    </main>
  );
}
