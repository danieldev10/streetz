"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Standard dialog focus behaviour: move focus into the dialog when it opens,
 * keep Tab inside it while it is open, and hand focus back to whatever was
 * focused before when it closes.
 */
export function useDialogFocus(isOpen: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function getFocusable() {
      const root = containerRef.current;

      if (!root) {
        return [] as HTMLElement[];
      }

      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.tabIndex !== -1
      );
    }

    const frame = window.requestAnimationFrame(() => {
      const [first] = getFocusable();
      first?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusable();

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const isInside = containerRef.current?.contains(active) ?? false;

      if (event.shiftKey && (active === first || !isInside)) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && (active === last || !isInside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, containerRef]);
}
