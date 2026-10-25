"use client";

import { SettingsLink } from "@/components/settings-link";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogIn, X } from "lucide-react";
import { MemberApp, type MemberAppRenderProps } from "@/components/app/member-app";
import { bottomTabs, tabRoutes, tabs } from "@/components/app/navigation";
import { appContentClassName, appFrameClassName, appSidebarClassName, DesktopHeader } from "@/components/app/desktop-layout";
import { BrandLogo } from "@/components/brand-logo";
import { PrivacyPolicyLink } from "@/components/privacy-policy-link";
import { useSession } from "@/components/app/session-provider";
import { isActiveMember } from "@/lib/api";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import type { ChatRoom, MatchThread, StreetzUser, TabKey } from "@/lib/types";

export type AuthPromptKind = "eventTicket" | "roomJoin" | "protectedTab" | "account" | "discovery";

export type PublicRouteRenderProps = MemberAppRenderProps & {
  token: string | null;
  user: StreetzUser | null;
  isPublicViewer: boolean;
  requestAuth: (kind?: AuthPromptKind) => void;
};

function getPromptCopy(kind: AuthPromptKind) {
  if (kind === "discovery") {
    return {
      title: "Log in to discover more",
      body: "Create an account or log in to view profiles, message people, choose your state and status, and enter the discovery pool.",
    };
  }

  if (kind === "eventTicket") {
    return {
      title: "Create an account to continue",
      body: "Sign up and activate your membership to buy or book event tickets.",
    };
  }

  if (kind === "roomJoin") {
    return {
      title: "Create an account to join event chats",
      body: "Event chats are available to active members. You can join the conversation before getting a ticket.",
    };
  }

  if (kind === "account") {
    return {
      title: "Log in or create an account",
      body: "Create an account to save your activity, buy tickets, join event chats, and meet people.",
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
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(true, dialogRef);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" tabIndex={-1} onClick={onClose} aria-label="Dismiss login prompt" />
      <section
        ref={dialogRef}
        className="relative w-full max-w-sm rounded-[28px] bg-surface p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-prompt-title"
        aria-describedby="auth-prompt-description"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-prompt-title" className="text-xl font-semibold text-ink">
              {copy.title}
            </h2>
            <p id="auth-prompt-description" className="mt-2 text-sm leading-6 text-ink-600">{copy.body}</p>
          </div>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line/8 text-ink"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-full bg-action px-5 text-sm font-medium text-action-foreground"
            href={"/?mode=create&next=" + encodedNext}
          >
            Create account
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-full border border-line/8 px-5 text-sm font-medium text-ink"
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
  const isPublicTab = tab.id === "events" || tab.id === "discovery";
  const base = "inline-flex items-center justify-center gap-2 text-sm font-medium transition";
  const activeClass = active ? "bg-action text-action-foreground" : "text-ink-600 hover:text-ink";
  const className = variant === "side"
    ? base + " " + (active ? "bg-brand-tint text-brand-deep" : "text-ink-600 hover:bg-surface-muted hover:text-ink") + " h-12 w-full justify-start! gap-3 rounded-2xl px-4"
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
    <main className="min-h-screen bg-surface text-ink md:bg-surface-sunken">
      <div className={appFrameClassName}>
        <aside className={appSidebarClassName}>
          <div>
            <Link href="/events" className="flex items-center gap-3 rounded-2xl px-2 py-1" aria-label="Crushclub home">
              <BrandLogo size="compact" priority />
              <div>
                <p className="text-lg font-bold tracking-tight">Crushclub</p>
                <p className="mt-0.5 text-xs text-ink-500">Your social circle</p>
              </div>
            </Link>
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
          <div className="mt-auto pt-8">
            <div className="mb-4 rounded-2xl border border-brand/10 bg-brand-wash p-4">
              <p className="text-sm font-semibold">More with an account</p>
              <p className="mt-2 text-xs leading-5 text-ink-600">Get tickets, join the conversation, and meet people.</p>
              <button type="button" className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full bg-brand-solid px-3 text-xs font-semibold text-white hover:bg-brand-solid/85" onClick={() => onRequestAuth("account")}>Join Crushclub</button>
            </div>
            <PrivacyPolicyLink />
          </div>
        </aside>

        <section className={appContentClassName}>
          <DesktopHeader activeTab={activeTab}>
            <div className="flex items-center gap-3">
            <SettingsLink />
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-action px-5 text-sm font-semibold text-action-foreground transition hover:bg-action/85" onClick={() => onRequestAuth("account")}>
              <LogIn className="size-4" aria-hidden="true" />
              Log in / Sign up
            </button>
            </div>
          </DesktopHeader>
          {/* Mirrors MobileHeader's grid so the logo stays centred and the header
              keeps the same height when a viewer logs in or out. */}
          <header className="sticky top-0 z-10 border-b border-line/[0.05] bg-surface/90 px-5 py-4 backdrop-blur md:hidden">
            <div className="grid grid-cols-[44px_1fr_44px] items-center">
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-full border border-line/[0.08] bg-brand-wash text-brand-strong shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                onClick={() => onRequestAuth("account")}
                aria-label="Open account options"
                title="Account"
              >
                <LogIn className="size-4" aria-hidden="true" />
              </button>
              <div className="justify-self-center">
                <BrandLogo size="header" priority />
              </div>
              <SettingsLink />
            </div>
          </header>
          {children}
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line/[0.05] bg-surface/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
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
