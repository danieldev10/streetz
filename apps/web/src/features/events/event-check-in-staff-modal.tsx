"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Trash2, UserPlus, X } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Staff = {
  userId: string;
  user: { displayName: string; email: string; accountStatus: string };
};

export function EventCheckInStaffModal({
  event,
  token,
  onClose
}: {
  event: { id: string; title: string };
  token: string;
  onClose: () => void;
}) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(true, dialog);
  const endpoint = `/admin/events/${encodeURIComponent(event.id)}/check-in-staff`;
  const load = useCallback(async () => {
    const response = await apiRequest<{ staff: Staff[] }>(endpoint, {
      headers: authHeaders(token)
    });
    setStaff(response.staff);
  }, [endpoint, token]);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load()
          .catch((caught) => setError(getUserErrorMessage(caught)))
          .finally(() => setLoading(false)),
      0
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const busy = saving || Boolean(removing);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
    };
  }, [busy, onClose]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(endpoint, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      setEmail("");
      await load();
    } catch (caught) {
      setError(getUserErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }
  async function remove(userId: string) {
    if (busy) return;
    setRemoving(userId);
    setError(null);
    try {
      await apiRequest(`${endpoint}/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: authHeaders(token)
      });
      await load();
    } catch (caught) {
      setError(getUserErrorMessage(caught));
    } finally {
      setRemoving(null);
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 py-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        disabled={busy}
        aria-label="Dismiss check-in staff"
        tabIndex={-1}
      />
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-staff-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="event-staff-title" className="text-xl font-semibold">
              Check-in staff
            </h2>
            <p className="mt-1 text-sm text-ink-600">{event.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close check-in staff"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-600">
          Add an existing account’s email. They can scan tickets for this event without a paid
          membership or admin access.
        </p>
        <form onSubmit={add} className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-medium">
            Staff account email
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              className="h-12 min-w-0 rounded-2xl border border-black/8 px-4 text-base"
            />
          </label>
          <ActionButton
            type="submit"
            isLoading={saving}
            disabled={Boolean(removing)}
            icon={<UserPlus className="size-4" />}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white"
          >
            Add staff
          </ActionButton>
        </form>
        <p className="mt-4 text-sm leading-6 text-ink-600">
          Staff can sign in on the{" "}
          <Link href="/check-in" className="font-semibold text-brand-strong underline">
            ticket check-in page
          </Link>
          . Their access is limited to assigned events.
        </p>
        {error ? (
          <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-2">
          {staff.map((entry) => (
            <div
              key={entry.userId}
              className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-black/5 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{entry.user.displayName}</p>
                <p className="truncate text-xs text-ink-600">{entry.user.email}</p>
                {entry.user.accountStatus !== "ACTIVE" ? (
                  <p className="text-xs text-red-700">Account unavailable</p>
                ) : null}
              </div>
              <ActionButton
                type="button"
                onClick={() => remove(entry.userId)}
                isLoading={removing === entry.userId}
                disabled={busy && removing !== entry.userId}
                icon={<Trash2 className="size-4" />}
                aria-label={`Remove ${entry.user.displayName}`}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-red-100 text-red-700"
              />
            </div>
          ))}
        </div>
        {!loading && staff.length === 0 ? (
          <p className="mt-4 text-sm text-ink-600">
            No staff assigned. Admins can already scan all events.
          </p>
        ) : null}
      </section>
    </div>
  );
}
