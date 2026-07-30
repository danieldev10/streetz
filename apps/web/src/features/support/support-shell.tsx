"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useSession } from "@/components/app/session-provider";

export function SupportShell({
  children,
  backHref,
  backLabel = "Back",
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  maxWidth?: "max-w-3xl" | "max-w-4xl" | "max-w-6xl";
}) {
  const { status, user } = useSession();
  const isMember = status === "authenticated" && Boolean(user);
  const homeHref = user?.role === "ADMIN" ? "/admin" : "/events";

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#0d0d0d]">
      <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/90 backdrop-blur">
        <div className={`mx-auto grid h-20 w-full ${maxWidth} grid-cols-[1fr_auto_1fr] items-center px-5`}>
          <Link
            className="inline-flex w-fit items-center gap-2 text-sm font-medium"
            href={backHref ?? homeHref}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </Link>
          <Link href="/events" aria-label="Crushclub events">
            <BrandLogo size="header" priority />
          </Link>
          {isMember ? (
            <span className="max-w-28 justify-self-end truncate text-right text-sm text-[#666666]">
              {user?.displayName}
            </span>
          ) : (
            <Link className="justify-self-end text-sm font-medium" href="/?mode=login">
              Log in
            </Link>
          )}
        </div>
      </header>

      <div className={`mx-auto w-full ${maxWidth} px-5 py-8 md:py-12`}>{children}</div>
    </main>
  );
}
