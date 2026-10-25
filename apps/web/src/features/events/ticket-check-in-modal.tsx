"use client";
import { getTableSize } from "./ticket-tiers";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  CheckCircle2,
  Keyboard,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  TriangleAlert,
  X
} from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { ApiError, apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { TicketCameraScanner } from "./ticket-camera-scanner";
import { ticketCodeFromScan } from "./ticket-scan";

type CheckInResult = {
  alreadyCheckedIn: boolean;
  ticket: {
    code: string;
    checkedInAt: string;
    checkedInBy: { displayName: string } | null;
    ticketType: { name: string };
    holder: { displayName: string } | null;
  };
};

export function TicketCheckInModal({
  event,
  token,
  onClose
}: {
  event: { id: string; title: string };
  token: string;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [online, setOnline] = useState(true);
  const dialogRef = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const awaitingNext = useRef(false);
  const mounted = useRef(true);
  useDialogFocus(true, dialogRef);
  useEffect(() => {
    mounted.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const network = () => setOnline(navigator.onLine);
    network();
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      mounted.current = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy.current) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function checkIn(raw: string) {
    if (busy.current || awaitingNext.current) return;
    const normalized = ticketCodeFromScan(raw);
    awaitingNext.current = true;
    setResult(null);
    setError(null);
    setUncertain(false);
    if (!normalized) {
      setError(
        "This QR does not contain a Crushclub ticket code. Scan the ticket QR or enter its code."
      );
      return;
    }
    setCode(normalized);
    if (!navigator.onLine) {
      setUncertain(true);
      setError(
        "You are offline. Connect to the internet and retry this ticket before admitting the holder."
      );
      return;
    }
    busy.current = true;
    setIsChecking(true);
    try {
      const response = await apiRequest<CheckInResult>(
        `/admissions/events/${encodeURIComponent(event.id)}/check-in`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ code: normalized })
        }
      );
      if (mounted.current) setResult(response);
    } catch (caught) {
      if (!mounted.current) return;
      const ambiguous =
        !(caught instanceof ApiError) || caught.status >= 500 || caught.status === 408;
      setUncertain(ambiguous);
      setError(
        ambiguous
          ? "Check-in was not confirmed. Retry this same ticket before admitting the holder; it may already have been recorded."
          : getUserErrorMessage(caught)
      );
    } finally {
      busy.current = false;
      if (mounted.current) setIsChecking(false);
    }
  }

  function nextTicket() {
    awaitingNext.current = false;
    setResult(null);
    setError(null);
    setUncertain(false);
    setCode("");
  }
  function cameraFailed(message: string) {
    setCameraEnabled(false);
    setCameraError(message);
  }
  const paused = isChecking || Boolean(result || error) || !online;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 py-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        disabled={isChecking}
        aria-label="Dismiss ticket check-in"
        tabIndex={-1}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-check-in-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[28px] bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="ticket-check-in-title" className="text-xl font-semibold">
              Scan tickets
            </h2>
            <p className="mt-1 text-sm text-ink-600">{event.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isChecking}
            aria-label="Close ticket check-in"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line/8"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1 text-sm font-medium">
          <button
            type="button"
            disabled={isChecking}
            onClick={() => {
              setMode("camera");
              nextTicket();
            }}
            aria-pressed={mode === "camera"}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 ${mode === "camera" ? "bg-action text-action-foreground" : ""}`}
          >
            <Camera className="size-4" />
            Scan QR
          </button>
          <button
            type="button"
            disabled={isChecking}
            onClick={() => {
              setMode("manual");
              setCameraEnabled(false);
              nextTicket();
            }}
            aria-pressed={mode === "manual"}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 ${mode === "manual" ? "bg-action text-action-foreground" : ""}`}
          >
            <Keyboard className="size-4" />
            Enter code
          </button>
        </div>
        {!online ? (
          <p role="alert" className="mt-3 rounded-xl bg-warning-tint p-3 text-sm text-warning">
            Internet is required to confirm admission. Scanning is paused.
          </p>
        ) : null}
        {mode === "camera" ? (
          cameraEnabled ? (
            <TicketCameraScanner
              paused={paused}
              onScan={(value) => void checkIn(value)}
              onError={cameraFailed}
            />
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-line/15 p-6 text-center">
              <ScanLine className="mx-auto size-12 text-brand-strong" />
              <p className="mt-3 text-sm text-ink-600">
                Point the camera at the QR on a phone or printed ticket.
              </p>
              <ActionButton
                type="button"
                disabled={!online}
                onClick={() => {
                  setCameraError(null);
                  setCameraEnabled(true);
                  nextTicket();
                }}
                icon={<Camera className="size-4" />}
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-5 text-sm font-medium text-action-foreground"
              >
                Open camera
              </ActionButton>
            </div>
          )
        ) : (
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void checkIn(code);
            }}
            className="mt-4 grid gap-3"
          >
            <label className="grid gap-2 text-sm font-medium">
              Ticket code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                minLength={6}
                maxLength={100}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={isChecking || Boolean(result || error)}
                placeholder="CCLTIX-..."
                className="h-12 min-w-0 rounded-2xl border border-line/8 px-4 font-mono text-base uppercase outline-none focus:border-brand"
              />
            </label>
            <ActionButton
              type="submit"
              isLoading={isChecking}
              disabled={!online || code.trim().length < 6 || Boolean(result || error)}
              icon={<ScanLine className="size-4" />}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-foreground"
            >
              Check in ticket
            </ActionButton>
          </form>
        )}
        {cameraError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {cameraError}
          </p>
        ) : null}
        {isChecking && mode === "camera" ? (
          <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" />
            Checking ticket…
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className={`mt-4 rounded-2xl p-4 text-sm ${uncertain ? "bg-warning-tint text-warning" : "bg-danger-tint text-danger"}`}
          >
            {error}
          </p>
        ) : null}
        {result ? (
          <div
            role="status"
            className={`mt-4 rounded-2xl p-4 text-sm ${result.alreadyCheckedIn ? "bg-warning-tint text-warning" : "bg-success-tint text-success-deep"}`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {result.alreadyCheckedIn ? (
                <TriangleAlert className="size-5 shrink-0" />
              ) : (
                <CheckCircle2 className="size-5 shrink-0" />
              )}
              {result.alreadyCheckedIn
                ? "Already used — do not admit again"
                : "Ticket valid — checked in"}
            </p>
            <p className="mt-2">
              {result.ticket.holder?.displayName ?? "Ticket holder"} ·{" "}
              {result.ticket.ticketType.name}
            </p>
            {getTableSize(result.ticket.ticketType.name) ? <p className="mt-1 font-semibold">
              Admits {getTableSize(result.ticket.ticketType.name)} people · One table
            </p> : null}
            <p className="mt-1 break-all font-mono">{result.ticket.code}</p>
            <p className="mt-2 text-xs">
              {new Intl.DateTimeFormat("en-NG", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Lagos"
              }).format(new Date(result.ticket.checkedInAt))}
              {result.ticket.checkedInBy ? ` · ${result.ticket.checkedInBy.displayName}` : ""}
            </p>
          </div>
        ) : null}
        {result || error ? (
          <div className="mt-3 grid gap-2">
            {uncertain ? (
              <ActionButton
                type="button"
                disabled={!online}
                onClick={() => {
                  awaitingNext.current = false;
                  void checkIn(code);
                }}
                icon={<RotateCcw className="size-4" />}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-foreground"
              >
                Retry this ticket
              </ActionButton>
            ) : null}
            <button
              type="button"
              onClick={nextTicket}
              className="h-11 rounded-full border border-line/8 text-sm font-semibold"
            >
              {mode === "camera" ? "Scan next ticket" : "Enter another ticket"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
