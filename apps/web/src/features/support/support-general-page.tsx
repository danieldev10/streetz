import Link from "next/link";
import {
  ChevronRight,
  CircleHelp,
  LifeBuoy,
  LockKeyhole,
  Send,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { SupportShell } from "./support-shell";

const supportDestinations: Array<{
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    href: "/support/faq",
    title: "Quick answers",
    description: "Check the most common account, event and ticket questions.",
    icon: CircleHelp,
  },
  {
    href: "/support/contact",
    title: "Contact support",
    description: "Give us the details once and continue the conversation in one place.",
    icon: Send,
  },
  {
    href: "/support/requests",
    title: "Private access",
    description: "Members use their account; guests receive a secure request link by email.",
    icon: LockKeyhole,
  },
];

export function SupportGeneralPage() {
  return (
    <SupportShell>
      <section className="overflow-hidden rounded-[32px] bg-[#0d0d0d] p-7 text-white md:p-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
            <LifeBuoy className="size-4" aria-hidden="true" />
            Support centre
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">How can we help?</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/70 md:text-base">
            Find quick answers or send our team a request. Every request gets a reference and a
            private conversation.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="Support options">
        {supportDestinations.map((destination) => {
          const Icon = destination.icon;
          return (
            <Link
              key={destination.href}
              className="group rounded-[24px] border border-black/[0.06] bg-white p-5 transition hover:border-black/15 hover:shadow-[0_10px_30px_rgba(0,0,0,0.04)]"
              href={destination.href}
            >
              <div className="flex items-center justify-between">
                <Icon className="size-5" aria-hidden="true" />
                <ChevronRight
                  className="size-4 text-[#999999] transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              <h2 className="mt-4 font-semibold">{destination.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#666666]">{destination.description}</p>
            </Link>
          );
        })}
      </section>

      <Link
        className="mt-6 block rounded-[24px] border border-red-200 bg-red-50 p-5 transition hover:border-red-300"
        href="/support/contact?category=SAFETY_REPORT"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-red-950">Safety concern?</h2>
              <ChevronRight className="size-4 shrink-0 text-red-700" aria-hidden="true" />
            </div>
            <p className="mt-1 text-sm leading-6 text-red-900/75">
              Choose “Safety concern” when contacting us. It is automatically marked urgent. If
              someone is in immediate danger, contact local emergency services.
            </p>
          </div>
        </div>
      </Link>
    </SupportShell>
  );
}
