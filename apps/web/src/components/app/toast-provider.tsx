"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastTone = "default" | "error";

type ToastState = {
  id: number;
  message: string;
  tone: ToastTone;
  visible: boolean;
};

type ShowToastOptions = {
  tone?: ToastTone;
  durationMs?: number;
};

type ToastContextValue = {
  showToast: (message: string, options?: ShowToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 2000;
// Matches the CSS transition duration below so the node is removed only after it slides away.
const EXIT_DURATION_MS = 220;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const removeTimerRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);
  const idRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (removeTimerRef.current !== null) {
      window.clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }

    if (enterFrameRef.current !== null) {
      window.cancelAnimationFrame(enterFrameRef.current);
      enterFrameRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (message: string, options?: ShowToastOptions) => {
      clearTimers();

      const id = (idRef.current += 1);
      const tone = options?.tone ?? "default";
      const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;

      // Mount hidden, then flip to visible on the next frame so the slide-up plays.
      setToast({ id, message, tone, visible: false });
      enterFrameRef.current = window.requestAnimationFrame(() => {
        setToast((current) => (current && current.id === id ? { ...current, visible: true } : current));
      });

      hideTimerRef.current = window.setTimeout(() => {
        setToast((current) => (current && current.id === id ? { ...current, visible: false } : current));
        removeTimerRef.current = window.setTimeout(() => {
          setToast((current) => (current && current.id === id ? null : current));
        }, EXIT_DURATION_MS);
      }, durationMs);
    },
    [clearTimers]
  );

  useEffect(() => clearTimers, [clearTimers]);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-[max(88px,calc(env(safe-area-inset-bottom)+88px))] md:pb-10">
              <div
                role="status"
                aria-live="polite"
                className={`pointer-events-auto max-w-sm rounded-full px-4 py-3 text-center text-sm font-medium text-white shadow-[0_12px_32px_rgba(0,0,0,0.22)] transition-all duration-200 ease-out ${
                  toast.visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                } ${toast.tone === "error" ? "bg-[#d63f3f]" : "bg-[#1c131c]"}`}
              >
                {toast.message}
              </div>
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
}
