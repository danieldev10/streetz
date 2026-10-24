"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/app/session-provider";
import { getBrowserSession } from "@/lib/browser-session";
import { PageKind, sendPageView, trafficHost, trafficPage, TRAFFIC_VISIT_KEY, WebsiteTrafficTracker } from "@/lib/website-traffic";

let tracker: WebsiteTrafficTracker | undefined;
function getTracker() {
  return tracker ??= new WebsiteTrafficTracker({
    now: () => Date.now(), id: () => crypto.randomUUID(),
    read: () => localStorage.getItem(TRAFFIC_VISIT_KEY),
    write: (value) => localStorage.setItem(TRAFFIC_VISIT_KEY, value),
    send: (view, token) => sendPageView(`${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/analytics/page-view`, view, token),
  });
}

export function useTrafficView(key: string | null, kind: PageKind | null) {
  const { status, user } = useSession();
  const admin = user?.role === "ADMIN";
  useEffect(() => {
    if (!key || !kind || status === "checking" || admin || !trafficHost(location.hostname) || navigator.webdriver) return;
    let timer: ReturnType<typeof setTimeout>;
    const record = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      // Allow redirects and authentication restoration to settle first.
      timer = setTimeout(() => {
        let delivery: Promise<void> | undefined;
        const run = () => {
          const session = getBrowserSession().current;
          if (session?.user.role !== "ADMIN") delivery = getTracker().view(key, kind, session?.accessToken);
        };
        // Coordinate the first visit identifier across tabs where supported.
        // Release the lock before waiting for network delivery.
        const pending = navigator.locks ? navigator.locks.request("crushclub_visit", run).then(() => delivery) : Promise.resolve().then(run).then(() => delivery);
        void pending.catch(() => {});
      }, 300);
    };
    const touch = () => { if (document.visibilityState === "visible") tracker?.touch(); };
    record();
    window.addEventListener("focus", record);
    document.addEventListener("visibilitychange", record);
    document.addEventListener("pointerdown", touch, { passive: true });
    document.addEventListener("scroll", touch, { passive: true });
    document.addEventListener("keydown", touch);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", record);
      document.removeEventListener("visibilitychange", record);
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("scroll", touch);
      document.removeEventListener("keydown", touch);
    };
  }, [key, kind, status, admin]);
}

export function WebsiteAnalytics() {
  const pathname = usePathname();
  const { user } = useSession();
  // The guest root redirects to Events; AuthShell tracks the actual login/create
  // screen separately, including its in-place mode switches.
  const kind = pathname === "/" && !user ? null : trafficPage(pathname);
  useTrafficView(pathname, kind);
  return null;
}
