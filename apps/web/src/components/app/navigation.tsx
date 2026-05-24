"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CreditCard,
  Flag,
  Heart,
  LogOut,
  Menu,
  MessageCircle,
  MessagesSquare,
  Palette,
  ShieldCheck,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import type { StreetzUser, TabKey } from "@/lib/types";

export const tabs: Array<{ id: TabKey; label: string; icon: LucideIcon }> = [
  { id: "discovery", label: "Discover", icon: Heart },
  { id: "matches", label: "Matches", icon: MessagesSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "rooms", label: "Rooms", icon: MessageCircle },
  { id: "events", label: "Events", icon: Ticket },
];

export const adminTabs: Array<{ id: TabKey; label: string; icon: LucideIcon }> = [
  { id: "rooms", label: "Rooms", icon: MessageCircle },
  { id: "events", label: "Events", icon: Ticket },
  { id: "reports", label: "Reports", icon: Flag },
  { id: "admin", label: "Metrics", icon: ShieldCheck },
];

export const tabRoutes: Record<TabKey, string> = {
  discovery: "/discover",
  matches: "/matches",
  notifications: "/notifications",
  profile: "/profile",
  rooms: "/rooms",
  events: "/events",
  admin: "/admin",
  reports: "/reports",
};

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const closeTimerRef = useRef<number | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const [isDrawerMounted, setIsDrawerMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const clearAnimationTimers = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (openFrameRef.current !== null) {
      window.cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearAnimationTimers();
    setIsDrawerMounted(true);
    openFrameRef.current = window.requestAnimationFrame(() => {
      setIsOpen(true);
    });
  }, [clearAnimationTimers]);

  const closeMenu = useCallback(() => {
    clearAnimationTimers();
    setIsOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      setIsDrawerMounted(false);
      closeTimerRef.current = null;
    }, 200);
  }, [clearAnimationTimers]);

  const closeLogoutConfirm = useCallback(() => {
    setIsLogoutConfirmOpen(false);
  }, []);

  useEffect(() => {
    return clearAnimationTimers;
  }, [clearAnimationTimers]);

  useEffect(() => {
    if (!isOpen && !isLogoutConfirmOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isLogoutConfirmOpen) {
          closeLogoutConfirm();
          return;
        }

        closeMenu();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isLogoutConfirmOpen, closeMenu, closeLogoutConfirm]);

  function requestLogout() {
    clearAnimationTimers();
    setIsOpen(false);
    setIsDrawerMounted(false);
    setIsLogoutConfirmOpen(true);
  }

  function confirmLogout() {
    setIsLogoutConfirmOpen(false);
    onLogout();
  }

  const drawer = (
    <div
      className={`fixed inset-0 z-50 isolate transition ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={closeMenu}
        aria-label="Close menu"
        tabIndex={isOpen ? 0 : -1}
      />

      <aside
        className={`absolute left-0 top-0 flex h-full w-[min(84vw,320px)] flex-col border-r border-black/[0.05] bg-[#ffffff] p-5 opacity-100 shadow-[8px_0_24px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Account menu"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold">crushclub</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Menu</p>
          </div>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
            onClick={closeMenu}
            aria-label="Close menu"
            tabIndex={isOpen ? 0 : -1}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="mt-8 grid gap-2">
          <button
            type="button"
            className="flex h-12 items-center justify-between rounded-full px-4 text-sm font-medium text-[#9a9a9a]"
            disabled
            aria-disabled="true"
          >
            <span className="inline-flex items-center gap-3">
              <CreditCard className="size-4" aria-hidden="true" />
              Subscriptions
            </span>
            <span className="rounded-full bg-[#f4f4f4] px-2 py-1 text-[11px] text-[#888888]">Soon</span>
          </button>

          <button
            type="button"
            className="flex h-12 items-center justify-between rounded-full px-4 text-sm font-medium text-[#9a9a9a]"
            disabled
            aria-disabled="true"
          >
            <span className="inline-flex items-center gap-3">
              <Palette className="size-4" aria-hidden="true" />
              Change Theme
            </span>
            <span className="rounded-full bg-[#f4f4f4] px-2 py-1 text-[11px] text-[#888888]">Soon</span>
          </button>

          <Link
            className="flex h-12 items-center gap-3 rounded-full px-4 text-sm font-medium text-[#0d0d0d] transition hover:bg-[#fafafa]"
            href="/profile"
            onClick={closeMenu}
            tabIndex={isOpen ? 0 : -1}
          >
            <UserRound className="size-4" aria-hidden="true" />
            Profile
          </Link>

            <button
              type="button"
              className="mt-3 inline-flex h-12 items-center gap-3 rounded-full bg-[#0d0d0d] px-4 text-sm font-medium text-white"
              onClick={requestLogout}
              tabIndex={isOpen ? 0 : -1}
            >
              <LogOut className="size-4" aria-hidden="true" />
            Logout
          </button>
        </nav>
      </aside>
    </div>
  );

  const logoutConfirmModal = (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/35 px-5" role="presentation">
      <section
        className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="logout-confirm-title" className="text-xl font-semibold">
              Logout?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#666666]">You will need to log in again to continue using crushclub.</p>
          </div>
          <button
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08]"
            type="button"
            onClick={closeLogoutConfirm}
            aria-label="Close"
            title="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-5 text-sm font-medium"
            type="button"
            onClick={closeLogoutConfirm}
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
            type="button"
            onClick={confirmLogout}
          >
            Logout
          </button>
        </div>
      </section>
    </div>
  );

  return (
    <>
      <button
        className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-[#0d0d0d]"
        onClick={openMenu}
        aria-label="Open menu"
        title="Menu"
      >
        <Menu className="size-4" aria-hidden="true" />
      </button>

      {isDrawerMounted && typeof document !== "undefined" ? createPortal(drawer, document.body) : null}
      {isLogoutConfirmOpen && typeof document !== "undefined" ? createPortal(logoutConfirmModal, document.body) : null}
    </>
  );
}

export function AppBrand({ user, onLogout }: { user: StreetzUser; onLogout: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold">crushclub</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{user.role}</p>
        </div>
        <AccountMenu onLogout={onLogout} />
      </div>
      <div className="mt-5 rounded-[16px] border border-black/[0.05] bg-[#fafafa] p-4">
        <p className="text-sm font-medium">{user.displayName}</p>
        <p className="mt-1 truncate text-xs text-[#666666]">{user.email}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#d4fae8] px-3 py-1 text-xs font-medium text-[#0fa76e]">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Active
        </div>
      </div>
    </div>
  );
}

export function MobileHeader({ user, onLogout }: { user: StreetzUser; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-black/[0.05] bg-white/90 px-5 py-4 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold">crushclub</p>
          <p className="text-xs font-medium text-[#666666]">{user.displayName}</p>
        </div>
        <AccountMenu onLogout={onLogout} />
      </div>
    </header>
  );
}

export function AppNavButton({
  tab,
  active,
  variant,
  badgeCount = 0,
  href = tabRoutes[tab.id],
  onClick,
}: {
  tab: { id: TabKey; label: string; icon: LucideIcon };
  active: boolean;
  variant: "side" | "bottom";
  badgeCount?: number;
  href?: string;
  onClick?: () => void;
}) {
  const Icon = tab.icon;
  const base = "inline-flex items-center justify-center gap-2 text-sm font-medium transition";
  const activeClass = active ? "bg-[#0d0d0d] text-white" : "text-[#666666] hover:text-[#0d0d0d]";
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);
  const badge =
    badgeCount > 0 ? (
      <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-[#18E299] px-1 text-[10px] font-semibold leading-5 text-[#0d0d0d] shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
        {badgeLabel}
      </span>
    ) : null;

  if (variant === "side") {
    return (
      <Link
        className={`${base} ${activeClass} h-11 rounded-full px-4`}
        href={href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
      >
        <span className="relative inline-flex">
          <Icon className="size-4" aria-hidden="true" />
          {badge}
        </span>
        <span>{tab.label}</span>
      </Link>
    );
  }

  return (
    <Link
      className={`${base} ${activeClass} min-h-14 rounded-[20px] px-2 py-2`}
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <span className="grid justify-items-center gap-1">
        <span className="relative inline-flex">
          <Icon className="size-5" aria-hidden="true" />
          {badge}
        </span>
        <span className="text-xs">{tab.label}</span>
      </span>
    </Link>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  leading,
  action,
}: {
  eyebrow: string;
  title: string;
  leading?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-6 md:px-8 md:pt-8">
      <div className="flex min-w-0 items-start gap-3">
        {leading ? <div className="shrink-0 pt-1">{leading}</div> : null}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight text-[#0d0d0d] md:text-5xl">{title}</h1>
        </div>
      </div>
      {action}
    </div>
  );
}
