"use client";

import { useEffect, useState } from "react";
import { Eye, LoaderCircle, MapPin, RefreshCw, SlidersHorizontal, UserRoundSearch } from "lucide-react";
import { DiscoveryPersonCard } from "@/features/discovery/discovery-person-card";
import { apiRequest, getUserErrorMessage } from "@/lib/api";
import type { PublicDiscoveryPreview } from "@/lib/types";

export function GuestDiscoveryTab({ onRequireAuth }: { onRequireAuth: () => void }) {
  const [preview, setPreview] = useState<PublicDiscoveryPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // Guest cards are deliberately not persisted or shared-cached: each visit
    // checks who is currently visible, without calling any member-only APIs.
    void apiRequest<PublicDiscoveryPreview>("/public/discovery/people", {
      cache: "no-store",
      signal: controller.signal,
    }).then((response) => {
      if (!controller.signal.aborted) {
        setPreview(response);
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setError(getUserErrorMessage(cause));
      }
    });

    return () => controller.abort();
  }, []);

  return (
    <section className="px-5 pb-24 pt-6 md:px-8 md:pt-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="sr-only">Discover people</h1>
        <p className="text-sm leading-6 text-ink-600">
          A preview of people in the pool. <button type="button" className="font-semibold text-brand-strong underline underline-offset-2" onClick={onRequireAuth}>Log in to connect.</button>
        </p>
        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink-400">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span>Nigeria</span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {preview ? <span className="text-sm font-medium text-ink-400">{preview.people.length} found</span> : null}
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center text-ink-400 transition hover:text-ink"
              onClick={onRequireAuth}
              aria-label="Refresh people"
              title="Refresh people"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-[22px] border border-black/[0.05] p-6 text-center" role="alert">
            <p className="font-semibold">Could not load the preview</p>
            <p className="mt-2 text-sm text-ink-600">{error}</p>
            <button type="button" className="mt-4 text-sm font-semibold text-brand-strong" onClick={onRequireAuth}>Log in to discover people</button>
          </div>
        ) : !preview ? (
          <div className="mt-4 flex min-h-64 items-center justify-center" role="status">
            <LoaderCircle className="size-6 animate-spin text-brand" aria-hidden="true" />
            <span className="sr-only">Loading discovery preview</span>
          </div>
        ) : preview.people.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {preview.people.map((person) => (
              <DiscoveryPersonCard key={person.id} person={person} showState onViewProfile={onRequireAuth} onMessage={onRequireAuth} />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid min-h-64 place-items-center rounded-[28px] border border-black/[0.05] p-6 text-center">
            <div>
              <UserRoundSearch className="mx-auto size-8 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-semibold">No profiles in the preview yet</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-600">Create an account to join the pool and meet people in your state.</p>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-5 z-30 inline-flex h-12 min-w-[7.5rem] items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-surface px-4 text-sm font-semibold text-ink-600 shadow-[0_8px_24px_rgba(0,0,0,0.14)] md:bottom-8 md:left-8"
        onClick={onRequireAuth}
        aria-label="Enter discovery pool"
      >
        <Eye className="size-4" aria-hidden="true" />
        Enter pool
      </button>
      <button
        type="button"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex size-12 items-center justify-center rounded-full bg-ink text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-ink/90 md:bottom-8 md:right-8"
        onClick={onRequireAuth}
        aria-label="Open discovery controls"
        aria-haspopup="dialog"
        title="Discovery controls"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
      </button>
    </section>
  );
}
