import type { ReactNode } from "react";

export function DiscoveryToolbar({ description, children }: { description: string; children: ReactNode }) {
  return (
    <div className="md:mb-7 md:flex md:flex-wrap md:items-center md:gap-4">
      <div className="md:mr-auto">
        <h1 className="sr-only md:not-sr-only md:text-3xl md:font-semibold md:tracking-tight">Discover people</h1>
        <p className="mt-2 hidden text-sm leading-6 text-ink-500 md:block">{description}</p>
      </div>
      <div className="md:flex md:items-center md:gap-2">{children}</div>
    </div>
  );
}
