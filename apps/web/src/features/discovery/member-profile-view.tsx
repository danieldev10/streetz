"use client";

import { useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { PROFILE_PHOTO_LIMIT, formatConnectionStatus } from "@/lib/profile";
import type { DiscoveryCandidate } from "@/lib/types";

export function MemberProfileView({
  candidate,
  onBack,
  backLabel,
}: {
  candidate: DiscoveryCandidate;
  onBack: () => void;
  backLabel: string;
}) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const visiblePhotos = candidate.photos.slice(0, PROFILE_PHOTO_LIMIT);
  const safeActivePhotoIndex = activePhotoIndex < visiblePhotos.length ? activePhotoIndex : 0;
  const activePhoto = visiblePhotos[safeActivePhotoIndex] ?? visiblePhotos[0];
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ") || "Nigeria";

  return (
    <section>
      <div className="px-5 pt-5 md:px-8 md:pt-8">
        <button
          className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#0d0d0d]"
          onClick={onBack}
          aria-label={backLabel}
          title="Back"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ScreenHeader
        eyebrow="Profile"
        title={`${candidate.displayName}${candidate.age ? `, ${candidate.age}` : ""}`}
      />

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        <div className="mx-auto max-w-[560px]">
          <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <div className="relative aspect-[1.05] min-h-[320px] bg-[#d4fae8]">
              <ProfilePhotoImage
                photo={activePhoto}
                alt={`${candidate.displayName} profile photo`}
                variant="full"
                sizes="(max-width: 768px) 100vw, 560px"
                iconSize="lg"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
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

            {visiblePhotos.length > 1 ? (
              <div className="grid grid-cols-4 gap-2 p-3">
                {visiblePhotos.map((photo, index) => {
                  const isActive = index === safeActivePhotoIndex;

                  return (
                    <button
                      key={photo.id}
                      className={`relative aspect-square overflow-hidden rounded-[16px] border ${
                        isActive ? "border-[#18E299] ring-2 ring-[#18E299]/30" : "border-black/[0.06]"
                      }`}
                      type="button"
                      onClick={() => setActivePhotoIndex(index)}
                      aria-label={`Show ${candidate.displayName} photo ${index + 1}`}
                    >
                      <ProfilePhotoImage
                        photo={photo}
                        alt={`${candidate.displayName} thumbnail ${index + 1}`}
                        variant="thumb"
                        sizes="96px"
                        iconSize="sm"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="px-5 pb-5 pt-2">
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
        </div>
      </div>
    </section>
  );
}
