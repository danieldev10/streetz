"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type QrScanner from "qr-scanner";

export function TicketCameraScanner({
  paused,
  onScan,
  onError
}: {
  paused: boolean;
  onScan: (code: string) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const pausedRef = useRef(paused);
  const scanRef = useRef(onScan);
  const errorRef = useRef(onError);
  const [starting, setStarting] = useState(true);
  useEffect(() => {
    scanRef.current = onScan;
    errorRef.current = onError;
  }, [onScan, onError]);
  useEffect(() => {
    pausedRef.current = paused;
    const current = scanner.current;
    if (!current) return;
    if (paused) current.pause();
    else
      void current
        .start()
        .catch(() =>
          errorRef.current("Camera could not restart. Try again or enter the ticket code.")
        );
  }, [paused]);
  useEffect(() => {
    let disposed = false;
    let current: QrScanner | null = null;
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Camera access is unavailable. Open Crushclub over HTTPS or enter the ticket code."
          );
        }
        const { default: Scanner } = await import("qr-scanner");
        if (disposed || !video.current) return;
        current = new Scanner(
          video.current,
          ({ data }) => {
            if (disposed || pausedRef.current) return;
            pausedRef.current = true;
            current?.pause();
            scanRef.current(data);
          },
          {
            preferredCamera: "environment",
            maxScansPerSecond: 8,
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true
          }
        );
        scanner.current = current;
        if (!pausedRef.current) await current.start();
        if (disposed) current.destroy();
        else setStarting(false);
      } catch (error) {
        if (disposed) return;
        current?.destroy();
        scanner.current = null;
        const name = error instanceof Error ? error.name : "";
        errorRef.current(
          name === "NotAllowedError"
            ? "Camera access was denied. Allow it in your browser settings, or enter the ticket code."
            : name === "NotFoundError"
              ? "No camera was found. Enter the ticket code instead."
              : error instanceof Error
                ? error.message
                : "Camera unavailable. Try again or enter the ticket code."
        );
      }
    }
    void start();
    return () => {
      disposed = true;
      current?.destroy();
      scanner.current = null;
    };
  }, []);
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className="aspect-square w-full object-cover"
        aria-label="Ticket QR camera preview"
      />
      {paused && !starting ? (
        <div className="absolute inset-0 grid place-items-center bg-black/75 text-sm font-medium text-white">
          Scanning paused
        </div>
      ) : null}
      {starting ? (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-white">
          <span className="grid justify-items-center gap-2 text-sm">
            <LoaderCircle className="size-6 animate-spin" />
            Opening camera
          </span>
        </div>
      ) : null}
    </div>
  );
}
