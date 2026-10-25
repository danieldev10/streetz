"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
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
      <legend className="mb-3 flex items-center gap-3 text-sm font-medium text-ink">
        <Palette className="size-4" aria-hidden="true" />Change Theme
      </legend>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line/8 bg-surface-muted p-1">
        {([{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Monitor }] as const).map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" aria-pressed={preference === value} onClick={() => setThemePreference(value)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition ${preference === value ? "bg-brand-tint text-brand-deep shadow-sm" : "text-ink-600 hover:bg-surface-shade hover:text-ink"}`}>
            <Icon className="size-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ThemeControl() {
  const id = useId();
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current && !root.current.contains(event.target)) root.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return (
    <details ref={root} className="group relative z-30" onKeyDown={(event) => {
      if (event.key === "Escape" && root.current?.open) {
        root.current.open = false;
        root.current.querySelector("summary")?.focus();
        event.stopPropagation();
      }
    }}>
      <summary aria-label="Change theme" aria-controls={id} title="Change theme"
        className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-line/8 bg-surface text-ink-600 transition marker:content-none hover:bg-brand-wash hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <Sun className="size-4 theme-light-icon" aria-hidden="true" /><Moon className="size-4 theme-dark-icon" aria-hidden="true" />
      </summary>
      <div id={id} className="absolute right-0 top-full mt-3 w-64 rounded-3xl border border-line/10 bg-surface p-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
        <ThemePicker />
      </div>
    </details>
  );
}
