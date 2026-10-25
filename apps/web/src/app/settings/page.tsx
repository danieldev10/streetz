"use client";

import Link from "next/link";
import { ArrowLeft, Palette } from "lucide-react";
import { PublicRoute } from "@/components/app/public-route";
import { ThemePicker } from "@/components/theme-picker";

export default function SettingsPage() {
  return (
    <PublicRoute activeTab="settings">
      {() => (
        <div className="mx-auto w-full max-w-3xl px-5 py-6 md:px-8 md:py-10">
          <Link href="/events" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-600 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />Back to events
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Settings</h1>
          <section aria-labelledby="appearance-heading" className="mt-6 rounded-3xl border border-line/8 bg-surface p-5 md:p-6">
            <div className="mb-6 flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-tint text-brand-strong">
                <Palette className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="appearance-heading" className="text-lg font-semibold text-ink">Appearance</h2>
                <p className="mt-1 text-sm leading-6 text-ink-600">Choose how Crushclub looks on this device.</p>
              </div>
            </div>
            <ThemePicker />
            <p className="mt-4 text-sm leading-6 text-ink-500">Your choice is saved in this browser. System follows your device’s appearance.</p>
          </section>
        </div>
      )}
    </PublicRoute>
  );
}
