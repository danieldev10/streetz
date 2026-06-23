"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { LogIn, Menu, X } from "lucide-react";
import { MemberApp, type MemberAppRenderProps } from "@/components/app/member-app";
import { bottomTabs, tabRoutes, tabs } from "@/components/app/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { useSession } from "@/components/app/session-provider";
import { isActiveMember } from "@/lib/api";
import type { ChatRoom, MatchThread, StreetzUser, TabKey } from "@/lib/types";

export type AuthPromptKind = "eventTicket" | "roomJoin" | "protectedTab" | "account";

export type PublicRouteRenderProps = MemberAppRenderProps & {
  token: string | null;
  user: StreetzUser | null;
  isPublicViewer: boolean;
  requestAuth: (kind?: AuthPromptKind) => void;
};

function getPromptCopy(kind: AuthPromptKind) {
  if (kind === "eventTicket") {
    return {
      title: "Create an account to continue",
      body: "Sign up and activate your membership to buy or book event tickets.",
    };
  }

  if (kind === "roomJoin") {
    return {
      title: "Create an account to join rooms",
      body: "Rooms are visible to browse, but joining and chatting require an active membership.",
    };
  }

  if (kind === "account") {
    return {
      title: "Log in or create an account",
      body: "Create an account to save your activity, buy tickets, join rooms, and meet people.",
    };
  }

  return {
    title: "Create an account to continue",
    body: "This part of crushclub requires an active member account.",
  };
}

function useReturnPath() {
  return usePathname();
}

function AuthPromptModal({ kind, nextPath, onClose }: { kind: AuthPromptKind; nextPath: string; onClose: () => void }) {
  const copy = getPromptCopy(kind);
  const encodedNext = encodeURIComponent(nextPath);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <section
        className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-prompt-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-prompt-title" className="text-xl font-semibold text-[#0d0d0d]">
              {copy.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#666666]">{copy.body}</p>
          </div>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8 text-[#0d0d0d]"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
            href={"/?mode=create&next=" + encodedNext}
          >
            Create account
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-full border border-black/8 px-5 text-sm font-medium text-[#0d0d0d]"
            href={"/?next=" + encodedNext}
          >
            Login
          </Link>
        </div>
      </section>
    </div>
  );
}

function PublicNavButton({ tab, active, variant, onRequireAuth }: {
  tab: (typeof tabs)[number];
  active: boolean;
  variant: "side" | "bottom";
  onRequireAuth: () => void;
}) {
  const Icon = tab.icon;
  const isPublicTab = tab.id === "events" || tab.id === "rooms";
  const base = "inline-flex items-center justify-center gap-2 text-sm font-medium transition";
  const activeClass = active ? "bg-[#0d0d0d] text-white" : "text-[#666666] hover:text-[#0d0d0d]";
  const className = variant === "side"
    ? base + " " + activeClass + " h-11 rounded-full px-4"
    : base + " " + activeClass + " min-h-14 rounded-[20px] px-2 py-2";
  const content = variant === "side" ? (
    <>
      <Icon className="size-4" aria-hidden="true" />
      <span>{tab.label}</span>
    </>
  ) : (
    <span className="grid justify-items-center gap-1">
      <Icon className="size-5" aria-hidden="true" />
      <span className="text-xs">{tab.label}</span>
    </span>
  );

  if (isPublicTab) {
    return (
      <Link className={className} href={tabRoutes[tab.id]} aria-current={active ? "page" : undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onRequireAuth} aria-current={active ? "page" : undefined}>
      {content}
    </button>
  );
}

function PublicAppShell({ activeTab, children, onRequestAuth }: { activeTab: TabKey; children: ReactNode; onRequestAuth: (kind?: AuthPromptKind) => void }) {
  return (
    <main className="min-h-screen bg-white text-[#0d0d0d]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-black/[0.05] bg-white px-4 py-5 md:block">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <BrandLogo size="sidebar" priority />
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Explore</p>
              </div>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
                onClick={() => onRequestAuth("account")}
                aria-label="Open account options"
                title="Account"
              >
                <LogIn className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 rounded-[16px] border border-black/[0.05] bg-[#fafafa] p-4">
              <p className="text-sm font-medium">Browse events and rooms</p>
              <p className="mt-1 text-xs leading-5 text-[#666666]">Create an account when you are ready to buy tickets, join rooms, or meet people.</p>
            </div>
          </div>
          <nav className="mt-8 grid gap-2">
            {tabs.map((tab) => (
              <PublicNavButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                variant="side"
                onRequireAuth={() => onRequestAuth("protectedTab")}
              />
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 pb-24 md:pb-0">
          <header className="sticky top-0 z-10 border-b border-black/[0.05] bg-white/90 px-5 py-4 backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-4">
              <div>
                <BrandLogo size="header" priority />
                <p className="mt-1 text-xs font-medium text-[#666666]">Explore</p>
              </div>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
                onClick={() => onRequestAuth("account")}
                aria-label="Open account options"
                title="Account"
              >
                <Menu className="size-4" aria-hidden="true" />
              </button>
            </div>
          </header>
          {children}
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/[0.05] bg-white/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl gap-1" style={{ gridTemplateColumns: "repeat(" + bottomTabs.length + ", minmax(0, 1fr))" }}>
          {bottomTabs.map((tab) => (
            <PublicNavButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              variant="bottom"
              onRequireAuth={() => onRequestAuth("protectedTab")}
            />
          ))}
        </div>
      </nav>
    </main>
  );
}

const emptyRenderProps: MemberAppRenderProps = {
  cachedMatches: [] as MatchThread[],
  cachedRooms: [] as ChatRoom[],
  onMatchCreated: () => undefined,
  onMatchesLoaded: () => undefined,
  onMatchOpened: () => undefined,
  onNotificationsChanged: () => undefined,
  onRoomsLoaded: () => undefined,
  onRoomOpened: () => undefined,
  refreshNotificationSummary: async () => undefined,
};

export function PublicRoute({ activeTab, children }: {
  activeTab: TabKey;
  children: (props: PublicRouteRenderProps) => ReactNode;
}) {
  const { status, token, user, logout } = useSession();
  const nextPath = useReturnPath();
  const [authPromptKind, setAuthPromptKind] = useState<AuthPromptKind | null>(null);
  const canUseMemberShell = status === "authenticated" && Boolean(token) && isActiveMember(user);
  const publicRenderProps = useMemo<PublicRouteRenderProps>(() => ({
    ...emptyRenderProps,
    token: null,
    user: null,
    isPublicViewer: true,
    requestAuth: (kind = "protectedTab") => setAuthPromptKind(kind),
  }), []);

  if (canUseMemberShell && token && user) {
    return (
      <MemberApp user={user} token={token} activeTab={activeTab} onLogout={logout}>
        {(memberProps) => children({
          ...memberProps,
          token,
          user,
          isPublicViewer: false,
          requestAuth: (kind = "protectedTab") => setAuthPromptKind(kind),
        })}
      </MemberApp>
    );
  }

  return (
    <>
      <PublicAppShell activeTab={activeTab} onRequestAuth={(kind = "protectedTab") => setAuthPromptKind(kind)}>
        {children(publicRenderProps)}
      </PublicAppShell>
      {authPromptKind ? (
        <AuthPromptModal kind={authPromptKind} nextPath={nextPath} onClose={() => setAuthPromptKind(null)} />
      ) : null}
    </>
  );
}
