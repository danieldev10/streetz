"use client";

import { LoaderCircle } from "lucide-react";

export function LoadingState({
  label = "Loading",
  className = "",
  spinnerClassName = "size-7",
}: {
  label?: string;
  className?: string;
  spinnerClassName?: string;
}) {
  return (
    <div className={`grid place-items-center ${className}`} role="status" aria-live="polite" aria-label={label}>
      <LoaderCircle className={`${spinnerClassName} animate-spin text-[#18E299]`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
