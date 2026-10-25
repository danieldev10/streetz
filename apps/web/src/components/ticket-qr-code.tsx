"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

export function TicketQrCode({ code, available = true }: { code: string; available?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [readyCode, setReadyCode] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (available)
      void import("qrcode")
        .then(async (module) => {
          if (!cancelled && canvas.current) {
            await module.toCanvas(canvas.current, code, {
              width: 240,
              margin: 4,
              errorCorrectionLevel: "M",
              color: { dark: "#000000ff", light: "#ffffffff" }
            });
            if (!cancelled) {
              setReadyCode(code);
              setError(false);
            }
          }
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    return () => {
      cancelled = true;
    };
  }, [available, code]);
  if (!available) return null;
  return (
    <div className="mt-4 rounded-2xl border border-line/5 bg-surface-muted p-2 text-center">
      <div className="relative mx-auto grid min-h-60 max-w-60 place-items-center">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`QR for ticket ${code}`}
          className={`h-auto w-full rounded-xl bg-white ${readyCode === code && !error ? "" : "invisible"}`}
        />
        {readyCode !== code && !error ? (
          <LoaderCircle
            className="absolute size-5 animate-spin text-ink-600"
            aria-label="Loading ticket QR"
          />
        ) : null}
        {error ? (
          <p className="absolute px-3 text-sm text-ink-600">
            QR unavailable. Use the ticket code below or download your PDF.
          </p>
        ) : null}
      </div>
      <p className="pb-2 text-xs text-ink-600">
        Show this QR at the entrance. One scan admits one person.
      </p>
    </div>
  );
}
