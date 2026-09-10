"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Bell,
  ChevronDown,
  CreditCard,
  Flag,
  Heart,
  LogOut,
  LifeBuoy,
  Menu,
  MessageCircle,
  MessagesSquare,
  Palette,
  ShieldCheck,
  Ticket,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { ProfilePhoto, StreetzUser, TabKey } from "@/lib/types";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { BrandLogo } from "@/components/brand-logo";
import { ProfilePhotoImage } from "@/components/profile-photo-image";

export const tabs: Array<{ id: TabKey; label: string; icon: LucideIcon }> = [
  { id: "events", label: "Events", icon: Ticket },
  { id: "rooms", label: "Rooms", icon: MessageCircle },
  { id: "discovery", label: "Discover", icon: Heart },
  { id: "notifications", label: "Alerts", icon: Bell },
  { id: "matches", label: "Matches", icon: MessagesSquare },
  { id: "blockedAccounts", label: "Blocked Accounts", icon: Ban },
];

export const bottomTabs = tabs.filter((tab) => tab.id !== "blockedAccounts");

export const adminTabs: Array<{ id: TabKey; label: string; icon: LucideIcon }> = [
  { id: "rooms", label: "Rooms", icon: MessageCircle },
  { id: "events", label: "Events", icon: Ticket },
  { id: "reports", label: "Reports", icon: Flag },
  { id: "users", label: "Users", icon: UsersRound },
  { id: "support", label: "Support", icon: LifeBuoy },
  { id: "admin", label: "Metrics", icon: ShieldCheck },
];

// Six columns leave ~57px each on a 375px screen, so Support moves to the
// account drawer and the mobile bar keeps the same five-slot density as members.
export const adminBottomTabs = adminTabs.filter((tab) => tab.id !== "support");

export const tabRoutes: Record<TabKey, string> = {
  discovery: "/discover",
  matches: "/matches",
  notifications: "/notifications",
  profile: "/profile",
  blockedAccounts: "/blocked-accounts",
  rooms: "/rooms",
  events: "/events",
  admin: "/admin",
  reports: "/reports",
  users: "/users",
  support: "/admin/support",
};

function AccountMenu({
  onLogout,
  isAdmin = false,
  trigger,
  triggerClassName,
  triggerTitle = "Menu",
}: {
  onLogout: () => void;
  isAdmin?: boolean;
  trigger?: ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
}) {
  const closeTimerRef = useRef<number | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const logoutDialogRef = useRef<HTMLElement | null>(null);
  const supportMenuId = useId();
  const [isDrawerMounted, setIsDrawerMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isSupportExpanded, setIsSupportExpanded] = useState(false);

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
    setIsSupportExpanded(false);
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

  useDialogFocus(isOpen, drawerRef);
  useDialogFocus(isLogoutConfirmOpen, logoutDialogRef);

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
        ref={drawerRef}
        className={`absolute left-0 top-0 flex h-full w-[min(84vw,320px)] flex-col border-r border-black/[0.05] bg-surface p-5 opacity-100 shadow-[8px_0_24px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Account menu"
      >
        <div className="flex items-center justify-between gap-4">
          <BrandLogo size="sidebar" priority />
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-ink"
            onClick={closeMenu}
            aria-label="Close menu"
            tabIndex={isOpen ? 0 : -1}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="mt-8 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
          {/* Admins cannot enter /profile or /blocked-accounts, so those links are
              member-only rather than dead ends that bounce back to /admin. */}
          {!isAdmin ? (
            <>
              <Link
                className="flex h-12 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink transition hover:bg-surface-muted"
                href="/profile"
                onClick={closeMenu}
                tabIndex={isOpen ? 0 : -1}
              >
                <UserRound className="size-4" aria-hidden="true" />
                Profile
              </Link>

              <Link
                className="flex h-12 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink transition hover:bg-surface-muted"
                href="/blocked-accounts"
                onClick={closeMenu}
                tabIndex={isOpen ? 0 : -1}
              >
                <Ban className="size-4" aria-hidden="true" />
                Blocked Accounts
              </Link>
            </>
          ) : null}

          {isAdmin ? (
            <Link
              className="flex h-12 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink transition hover:bg-surface-muted"
              href="/admin/support"
              onClick={closeMenu}
              tabIndex={isOpen ? 0 : -1}
            >
              <LifeBuoy className="size-4" aria-hidden="true" />
              Support
            </Link>
          ) : (
            <div>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-between rounded-full px-4 text-sm font-medium text-ink transition hover:bg-surface-muted"
                onClick={() => setIsSupportExpanded((current) => !current)}
                aria-expanded={isSupportExpanded}
                aria-controls={supportMenuId}
                tabIndex={isOpen ? 0 : -1}
              >
                <span className="inline-flex items-center gap-3">
                  <LifeBuoy className="size-4" aria-hidden="true" />
                  Support
                </span>
                <ChevronDown
                  className={`size-4 transition-transform ${isSupportExpanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              <div
                id={supportMenuId}
                aria-hidden={!isSupportExpanded}
                className={`grid overflow-hidden pl-8 transition-[grid-template-rows,opacity] duration-200 ${
                  isSupportExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="min-h-0">
                  {[
                    { href: "/support", label: "General" },
                    { href: "/support/requests", label: "Requests" },
                    { href: "/support/faq", label: "FAQ" },
                    { href: "/support/contact", label: "Contact Us" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      className="flex h-10 items-center rounded-full px-4 text-sm text-ink-600 transition hover:bg-surface-muted hover:text-ink"
                      href={item.href}
                      onClick={closeMenu}
                      tabIndex={isOpen && isSupportExpanded ? 0 : -1}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            className="flex h-12 items-center justify-between rounded-full px-4 text-sm font-medium text-ink-300"
            disabled
            aria-disabled="true"
          >
            <span className="inline-flex items-center gap-3">
              <CreditCard className="size-4" aria-hidden="true" />
              Subscriptions
            </span>
            <span className="rounded-full bg-surface-shade px-2 py-1 text-[11px] text-ink-400">Soon</span>
          </button>

          <button
            type="button"
            className="flex h-12 items-center justify-between rounded-full px-4 text-sm font-medium text-ink-300"
            disabled
            aria-disabled="true"
          >
            <span className="inline-flex items-center gap-3">
              <Palette className="size-4" aria-hidden="true" />
              Change Theme
            </span>
            <span className="rounded-full bg-surface-shade px-2 py-1 text-[11px] text-ink-400">Soon</span>
          </button>

          <button
            type="button"
            className="mt-3 inline-flex h-12 items-center gap-3 rounded-full bg-ink px-4 text-sm font-medium text-white"
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
    <div className="fixed inset-0 z-[60] grid place-items-center px-5">
      {/* Dismissible backdrop, matching the drawer's click-outside behaviour. */}
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        onClick={closeLogoutConfirm}
        aria-label="Close"
      />
      <section
        ref={logoutDialogRef}
        className="relative w-full max-w-sm rounded-[24px] bg-surface p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="logout-confirm-title" className="text-xl font-semibold">
              Logout?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">You will need to log in again to continue using crushclub.</p>
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white"
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
        type="button"
        className={triggerClassName ?? "inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-ink"}
        onClick={openMenu}
        aria-label="Open menu"
        title={triggerTitle}
      >
        {trigger ?? <Menu className="size-4" aria-hidden="true" />}
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
          <BrandLogo size="sidebar" priority />
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.08em] text-ink-400">{user.role}</p>
        </div>
        <AccountMenu onLogout={onLogout} isAdmin={user.role === "ADMIN"} />
      </div>
      <div className="mt-5 rounded-[16px] border border-black/[0.05] bg-surface-muted p-4">
        <p className="text-sm font-medium">{user.displayName}</p>
        <p className="mt-1 truncate text-xs text-ink-600">{user.email}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand-strong">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Active
        </div>
      </div>
    </div>
  );
}

export function MobileHeader({
  user,
  profilePhoto,
  onLogout,
}: {
  user: StreetzUser;
  profilePhoto?: ProfilePhoto;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-black/[0.05] bg-surface/90 px-5 py-4 backdrop-blur md:hidden">
      <div className="grid grid-cols-[44px_1fr_44px] items-center">
        <AccountMenu
          onLogout={onLogout}
          isAdmin={user.role === "ADMIN"}
          triggerClassName="inline-flex size-11 overflow-hidden rounded-full border border-black/[0.08] bg-brand-wash text-brand-strong shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          triggerTitle={user.displayName ? "Open " + user.displayName + "'s menu" : "Open menu"}
          trigger={
            <ProfilePhotoImage
              photo={profilePhoto}
              alt={user.displayName ? user.displayName + " profile photo" : "Profile photo"}
              variant="thumb"
              sizes="44px"
              priority
              iconSize="sm"
            />
          }
        />
        <div className="justify-self-center">
          <BrandLogo size="header" priority />
        </div>
        <span className="size-11" aria-hidden="true" />
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
  const activeClass = active ? "bg-ink text-white" : "text-ink-600 hover:text-ink";
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);
  const badge =
    badgeCount > 0 ? (
      <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-brand-strong px-1 text-[10px] font-semibold leading-5 text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
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
