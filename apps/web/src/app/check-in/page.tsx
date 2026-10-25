"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, LoaderCircle, LogOut, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ActionButton } from "@/components/action-button";
import { useSession } from "@/components/app/session-provider";
import { ApiError, apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { TicketCheckInModal } from "@/features/events/ticket-check-in-modal";

type CheckInEvent = { id: string; title: string; venue: string; city: string; startsAt: string };

function CheckInWorkspace({ token }: { token: string }) {
  const [events, setEvents] = useState<CheckInEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selected, setSelected] = useState<CheckInEvent | null>(null);
  const load = useCallback(
    async (after?: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<{ events: CheckInEvent[]; nextCursor: string | null }>(
          `/admissions/events${after ? `?cursor=${encodeURIComponent(after)}` : ""}`,
          { headers: authHeaders(token) }
        );
        setEvents((current) => (after ? [...current, ...response.events] : response.events));
        setCursor(response.nextCursor);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 403) {
          setAccessDenied(true);
          setEvents([]);
          setSelected(null);
          setCursor(null);
        }
        setError(getUserErrorMessage(caught));
      } finally {
        setLoading(false);
      }
    },
    [token]
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (accessDenied) {
    return (
      <section role="alert" className="mt-8 rounded-3xl border border-line/5 p-6 text-center">
        <ShieldCheck className="mx-auto size-10 text-brand-strong" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold">Staff access only</h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Ticket check-in is restricted to admins and assigned event staff.
        </p>
      </section>
    );
  }
  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Ticket check-in</h1>
        <ActionButton
          type="button"
          isLoading={loading}
          onClick={() => load()}
          aria-label="Refresh events"
          icon={<RefreshCw className="size-4" />}
          className="inline-flex size-11 items-center justify-center rounded-full border border-line/8"
        />
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        Choose your assigned event to scan tickets. An internet connection is required.
      </p>
      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-danger-tint p-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-5 grid gap-3">
        {events.map((event) => (
          <article
            key={event.id}
            className="rounded-3xl border border-line/5 bg-surface p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold">{event.title}</h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-600">
              <CalendarDays className="size-4" />
              {new Intl.DateTimeFormat("en-NG", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Lagos"
              }).format(new Date(event.startsAt))}
            </p>
            <p className="mt-1 text-sm text-ink-600">
              {event.venue}, {event.city}
            </p>
            <ActionButton
              type="button"
              onClick={() => setSelected(event)}
              icon={<ScanLine className="size-4" />}
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-5 text-sm font-medium text-action-foreground"
            >
              Scan tickets
            </ActionButton>
          </article>
        ))}
      </div>
      {loading && events.length === 0 ? (
        <LoaderCircle className="mx-auto mt-10 size-6 animate-spin" aria-label="Loading events" />
      ) : null}
      {!loading && !error && events.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-surface-muted p-5 text-sm leading-6 text-ink-600">
          No events are assigned to you. Ask an admin to add your account email to the event’s
          check-in staff.
        </p>
      ) : null}
      {cursor ? (
        <ActionButton
          type="button"
          isLoading={loading}
          onClick={() => load(cursor)}
          className="mt-4 h-11 w-full rounded-full border border-line/8 text-sm font-medium"
        >
          Load more events
        </ActionButton>
      ) : null}
      {selected ? (
        <TicketCheckInModal
          key={selected.id}
          event={selected}
          token={token}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

export default function CheckInPage() {
  const { status, token, user, logout } = useSession();
  return (
    <main className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-lg px-5 py-6">
        <header className="flex items-center justify-between gap-4">
          <Link href="/events" className="inline-flex h-11 items-center gap-1 text-sm">
            <ChevronLeft className="size-4" />
            Events
          </Link>
          <BrandLogo size="compact" />
          {user ? (
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex size-11 items-center justify-center rounded-full border border-line/8"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </button>
          ) : (
            <span className="size-11" />
          )}
        </header>
        {status === "checking" ? (
          <LoaderCircle
            className="mx-auto mt-10 size-6 animate-spin"
            aria-label="Checking session"
          />
        ) : !user || !token ? (
          <section className="mt-8 rounded-3xl border border-line/5 p-6 text-center">
            <ScanLine className="mx-auto size-10 text-brand-strong" />
            <h1 className="mt-4 text-2xl font-semibold">Staff check-in</h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Log in with the account assigned to this event. No paid membership is required.
            </p>
            <Link
              href="/?mode=login&next=%2Fcheck-in"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-action px-6 text-sm font-medium text-action-foreground"
            >
              Log in
            </Link>
          </section>
        ) : user.accountStatus !== "ACTIVE" ? (
          <p className="mt-8 rounded-2xl bg-danger-tint p-4 text-sm text-danger">
            Your account is unavailable for check-in. Contact support or an admin.
          </p>
        ) : (
          <CheckInWorkspace key={user.id} token={token} />
        )}
      </div>
    </main>
  );
}
