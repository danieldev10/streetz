"use client";

import { LoaderCircle } from "lucide-react";
import { useRef, useState, useTransition, type ComponentProps, type MouseEvent, type ReactNode } from "react";

type ActionButtonProps = Omit<ComponentProps<"button">, "onClick"> & {
  isLoading?: boolean;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  spinnerClassName?: string;
  appearance?: "default" | "plain";
  trackNavigation?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
};

/** Tracks async clicks and route transitions; form submissions can supply isLoading. */
export function ActionButton({
  isLoading = false,
  icon,
  iconPosition = "start",
  spinnerClassName = "size-4",
  appearance = "default",
  trackNavigation = false,
  disabled,
  className,
  children,
  onClick,
  ...props
}: ActionButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [isClickPending, setIsClickPending] = useState(false);
  const inFlightRef = useRef(false);
  const isWorking = isLoading || isClickPending || isPending;

  async function runAction(event: MouseEvent<HTMLButtonElement>) {
    try {
      await onClick?.(event);
    } finally {
      inFlightRef.current = false;
      setIsClickPending(false);
    }
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (disabled || isWorking || inFlightRef.current) {
      event.preventDefault();
      return;
    }

    if (!onClick) return;

    inFlightRef.current = true;
    setIsClickPending(true);
    if (trackNavigation) {
      startTransition(() => runAction(event));
    } else {
      void runAction(event);
    }
  }

  const actionIcon = isWorking
    ? <LoaderCircle className={`shrink-0 animate-spin ${spinnerClassName}`} aria-hidden="true" />
    : icon;

  return (
    <button
      {...props}
      className={`action-button ${className ?? ""}`}
      data-loading-appearance={appearance}
      disabled={disabled || isWorking}
      aria-busy={isWorking}
      onClick={handleClick}
    >
      {iconPosition === "start" ? actionIcon : null}
      {children}
      {iconPosition === "end" ? actionIcon : null}
    </button>
  );
}
