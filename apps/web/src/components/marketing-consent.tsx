"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/app/session-provider";
import { CONSENT_KEY, MARKETING_CHANGE, MARKETING_PREFERENCES, installMarketingNavigationGuard,
  invalidateMarketingConsent, marketingHost, readMarketingConsent, setMarketingConsent, syncMarketing } from "@/lib/marketing";

export function MarketingConsent() {
  const pathname = usePathname();
  const { status, user } = useSession();
  const [visible, setVisible] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => installMarketingNavigationGuard(), []);
  useEffect(() => {
    const refresh = () => {
      setVisible(marketingHost(window.location.hostname) && user?.role !== "ADMIN" && readMarketingConsent() === null);
      syncMarketing(user?.role === "ADMIN", status !== "checking");
    };
    const storage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) { invalidateMarketingConsent(); refresh(); }
    };
    const open = () => setPreferencesOpen(true);
    refresh();
    window.addEventListener(MARKETING_CHANGE, refresh);
    window.addEventListener(MARKETING_PREFERENCES, open);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(MARKETING_CHANGE, refresh);
      window.removeEventListener(MARKETING_PREFERENCES, open);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", refresh);
    };
  }, [pathname, status, user?.role]);

  function choose(allowed: boolean) {
    setMarketingConsent(allowed);
    setPreferencesOpen(false);
    setVisible(false);
  }
  if (!visible && !preferencesOpen) return null;
  return (
    <section aria-label="Cookie preferences" className="fixed inset-x-3 bottom-28 z-[100] mx-auto max-w-xl rounded-3xl border border-border-soft bg-surface p-5 shadow-xl md:inset-x-auto md:right-6 md:bottom-6">
      <h2 className="text-lg font-semibold text-ink">Your cookie preferences</h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">Essential cookies keep you signed in. With your permission, TikTok uses optional cookies to measure our ads, event views, checkouts, purchases and sign-ups. You can change your choice in our <Link href="/privacy-policy" className="text-brand-strong underline">Privacy Policy</Link>.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" className="min-h-11 rounded-full border border-border-soft px-4 py-3 text-sm font-semibold text-ink" onClick={() => choose(false)}>Reject optional</button>
        <button type="button" className="min-h-11 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white" onClick={() => choose(true)}>Accept optional</button>
      </div>
    </section>
  );
}

export function CookiePreferencesButton() {
  return <button type="button" className="mt-3 rounded-full border border-border-soft px-5 py-3 text-sm font-semibold text-ink" onClick={() => window.dispatchEvent(new Event(MARKETING_PREFERENCES))}>Cookie preferences</button>;
}
