"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Ticket, TriangleAlert, X } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import type { StreetzEvent } from "@/lib/types";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type CheckInResult = {
  alreadyCheckedIn: boolean;
  ticket: { code: string; checkedInAt: string; ticketType: { name: string }; holder: { displayName: string } | null };
};

export function TicketCheckInModal({ event, token, onClose }: { event: StreetzEvent; token: string; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(true, dialogRef);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) { if (event.key === "Escape" && !isChecking) onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); };
  }, [isChecking, onClose]);

  async function checkIn(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (isChecking || code.trim().length < 6) return;
    setIsChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await apiRequest<CheckInResult>(`/admin/events/${encodeURIComponent(event.id)}/check-in`, {
        method: "POST", headers: authHeaders(token), body: JSON.stringify({ code: code.trim().toUpperCase() })
      }));
    } catch (caught) { setError(getUserErrorMessage(caught)); }
    finally { setIsChecking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" onClick={onClose} disabled={isChecking} aria-label="Dismiss ticket check-in" tabIndex={-1} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ticket-check-in-title"
        className="relative w-full max-w-sm rounded-[28px] bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="ticket-check-in-title" className="text-xl font-semibold">Ticket check-in</h2><p className="mt-1 text-sm text-ink-600">{event.title}</p></div>
          <button type="button" onClick={onClose} disabled={isChecking} aria-label="Close ticket check-in"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/8">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={checkIn} className="mt-5 grid gap-3">
          <label className="grid gap-2 text-sm font-medium">
            Ticket code
            <input value={code} onChange={(inputEvent) => { setCode(inputEvent.target.value); setResult(null); setError(null); }}
              required minLength={6} maxLength={100} autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={isChecking}
              placeholder="Enter the code on the ticket"
              className="h-12 min-w-0 rounded-2xl border border-black/8 px-4 font-mono text-base uppercase outline-none focus:border-brand" />
          </label>
          <p className="text-xs leading-5 text-ink-600">This checks the code for this event and marks a valid ticket as used.</p>
          <ActionButton type="submit" isLoading={isChecking} disabled={code.trim().length < 6} icon={<Ticket className="size-4" aria-hidden="true" />}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white">
            Check in ticket
          </ActionButton>
        </form>
        {error ? <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {result ? (
          <div role="status" className={`mt-4 rounded-2xl p-4 text-sm ${result.alreadyCheckedIn ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
            <p className="flex items-center gap-2 font-semibold">
              {result.alreadyCheckedIn ? <TriangleAlert className="size-5" aria-hidden="true" /> : <CheckCircle2 className="size-5" aria-hidden="true" />}
              {result.alreadyCheckedIn ? "Already used — do not admit again" : "Ticket valid — checked in"}
            </p>
            <p className="mt-2">{result.ticket.holder?.displayName ?? "Ticket holder"} · {result.ticket.ticketType.name}</p>
            <p className="mt-1 font-mono">{result.ticket.code}</p>
            <p className="mt-1 text-xs">Checked in {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(result.ticket.checkedInAt))}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
