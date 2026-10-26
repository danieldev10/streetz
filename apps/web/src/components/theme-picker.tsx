"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { getThemePreference, setThemePreference, subscribeTheme } from "@/lib/theme";

// Keep other tabs and OS changes in sync even while every picker is closed.
export function ThemeSync() {
  useEffect(() => subscribeTheme(() => undefined), []);
  return null;
}

export function ThemePicker() {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference, () => "light");
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line/8 bg-surface-muted p-1">
        {([{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Monitor }] as const).map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" aria-pressed={preference === value} onClick={() => setThemePreference(value)}
            className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm font-medium transition ${preference === value ? "bg-brand-tint text-brand-deep shadow-sm" : "text-ink-600 hover:bg-surface-shade hover:text-ink"}`}>
            <Icon className="size-5" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
