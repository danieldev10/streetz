"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Palette, X } from "lucide-react";
import { PublicRoute } from "@/components/app/public-route";
import { ThemePicker } from "@/components/theme-picker";
import { useDialogFocus } from "@/lib/use-dialog-focus";

function AppearanceDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogFocus(true, dialogRef);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="Close appearance" tabIndex={-1} onClick={onClose} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[28px] bg-surface p-5 text-ink shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold">Appearance</h2>
          <button type="button" aria-label="Close appearance" onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line/8">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <ThemePicker />
      </section>
    </div>,
    document.body,
  );
}

export default function SettingsPage() {
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const closeAppearance = useCallback(() => setIsAppearanceOpen(false), []);

  return (
    <PublicRoute activeTab="settings">
      {() => (
        <div className="mx-auto w-full max-w-3xl px-5 py-6 md:px-8 md:py-10">
          <Link href="/events" aria-label="Back to events" className="mb-6 inline-flex size-10 items-center justify-center rounded-full border border-line/8 text-ink-600 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Settings</h1>
          <button type="button" aria-haspopup="dialog" aria-expanded={isAppearanceOpen} onClick={() => setIsAppearanceOpen(true)}
            className="mt-6 flex w-full items-center gap-3 rounded-3xl border border-line/8 bg-surface p-5 text-left transition hover:border-brand/30 md:p-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-tint text-brand-strong">
              <Palette className="size-5" aria-hidden="true" />
            </span>
            <span className="flex-1 text-base font-semibold text-ink">Appearance</span>
            <ChevronRight className="size-5 text-ink-400" aria-hidden="true" />
          </button>
          {isAppearanceOpen ? <AppearanceDialog onClose={closeAppearance} /> : null}
        </div>
      )}
    </PublicRoute>
  );
}
