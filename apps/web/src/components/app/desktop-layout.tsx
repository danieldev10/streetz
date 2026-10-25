import type { ReactNode } from "react";
import type { TabKey } from "@/lib/types";

export const appFrameClassName = "mx-auto flex min-h-screen w-full md:max-w-[1440px] md:border-x md:border-line/[0.05]";
export const appSidebarClassName = "sticky top-0 hidden h-dvh w-56 shrink-0 flex-col overflow-y-auto border-r border-line/[0.05] bg-surface px-4 py-6 md:flex xl:w-60";
export const appContentClassName = "min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:bg-surface-muted/70 md:pb-0";

const pageLabels: Record<TabKey, string> = {
  events: "Events",
  discovery: "Discover",
  matches: "Messages",
  notifications: "Alerts",
  profile: "My profile",
  blockedAccounts: "Blocked accounts",
  admin: "Metrics",
  reports: "Reports",
  users: "Users",
  support: "Support",
  settings: "Settings",
};

export function DesktopHeader({ activeTab, children }: { activeTab: TabKey; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 hidden h-20 items-center justify-between gap-4 border-b border-line/[0.05] bg-surface/95 px-8 backdrop-blur md:flex">
      <p className="flex min-w-0 items-center gap-3 text-sm">
        <span className="text-ink-400">Crushclub</span>
        <span className="text-ink-200" aria-hidden="true">/</span>
        <span className="truncate font-semibold text-ink">{pageLabels[activeTab]}</span>
      </p>
      {children}
    </header>
  );
}
