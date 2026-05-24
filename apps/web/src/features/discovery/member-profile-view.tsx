"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { formatConnectionStatus } from "@/lib/profile";
import type { DiscoveryCandidate } from "@/lib/types";

export function MemberProfileView({
  candidate,
  onBack,
  backLabel,
  footer,
}: {
  candidate: DiscoveryCandidate;
  onBack: () => void;
  backLabel: string;
  footer?: ReactNode;
}) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const photos = candidate.photos;
  const hasMultiplePhotos = photos.length > 1;
  const activePhoto = photos[activePhotoIndex];
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ") || "Nigeria";

  function goToPrevious() {
    setActivePhotoIndex((current) => (current > 0 ? current - 1 : photos.length - 1));
  }

  function goToNext() {
    setActivePhotoIndex((current) => (current < photos.length - 1 ? current + 1 : 0));
  }

  return (
    <section className="pt-5 md:pt-8">
      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className="mx-auto max-w-[560px]">
          <button
            className="mb-4 inline-flex h-10 items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#0d0d0d] shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
            type="button"
            onClick={onBack}
            aria-label={backLabel}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </button>
          <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <div className="relative aspect-[1.05] min-h-[320px] bg-[#d4fae8]">

              {/* Segmented progress bar */}
              {hasMultiplePhotos ? (
                <div className="absolute inset-x-4 top-3 z-10 flex gap-1">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="h-[2px] flex-1 rounded-full"
                      style={{
                        backgroundColor: index === activePhotoIndex ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                      }}
                    />
                  ))}
                </div>
              ) : null}

              <ProfilePhotoImage
                key={activePhoto?.id}
                photo={activePhoto}
                alt={`${candidate.displayName} profile photo ${activePhotoIndex + 1} of ${photos.length}`}
                variant="full"
                sizes="(max-width: 768px) 100vw, 560px"
                iconSize="lg"
              />

              {/* Tap zones for navigating photos */}
              {hasMultiplePhotos ? (
                <>
                  <button
                    type="button"
                    className="absolute inset-y-0 left-0 z-[5] w-[30%] cursor-pointer"
                    onClick={goToPrevious}
                    aria-label="Previous photo"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 z-[5] w-[30%] cursor-pointer"
                    onClick={goToNext}
                    aria-label="Next photo"
                  />

                  {/* Chevron arrows */}
                  <div
                    className="pointer-events-none absolute left-3 top-1/2 z-[6] grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm"
                    aria-hidden="true"
                  >
                    <ChevronLeft className="size-4" />
                  </div>
                  <div
                    className="pointer-events-none absolute right-3 top-1/2 z-[6] grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm"
                    aria-hidden="true"
                  >
                    <ChevronRight className="size-4" />
                  </div>
                </>
              ) : null}

              <div className="absolute inset-x-0 bottom-0 z-[7] bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
                <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                  {formatConnectionStatus(candidate.connectionStatus)}
                </span>
                <h2 className="mt-3 text-3xl font-semibold">
                  {candidate.displayName}
                  {candidate.age ? `, ${candidate.age}` : ""}
                </h2>
                <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                  <MapPin className="size-4" aria-hidden="true" />
                  {location}
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Bio</p>
                <p className="mt-2 text-sm leading-6 text-[#444444]">{candidate.bio || "No bio added yet."}</p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Status</p>
                <p className="mt-2 text-sm font-medium text-[#444444]">
                  {formatConnectionStatus(candidate.connectionStatus)}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Location</p>
                <p className="mt-2 flex items-center gap-1 text-sm font-medium text-[#444444]">
                  <MapPin className="size-4 text-[#18E299]" aria-hidden="true" />
                  {location}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Interests</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidate.interests.length > 0 ? (
                    candidate.interests.slice(0, 10).map((interest) => (
                      <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
                        {interest}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#777777]">No interests added yet.</span>
                  )}
                </div>
              </div>
            </div>
          </article>
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
      </div>
    </section>
  );
}

