"use client";

import Image from "next/image";
import { Camera } from "lucide-react";
import { useState } from "react";
import type { ProfilePhoto } from "@/lib/types";
import { formatImageUrlForDebug, getProfilePhotoFallbackUrl, getProfilePhotoUrl } from "@/lib/media";

export function ProfilePhotoImage({
  photo,
  alt,
  variant = "card",
  priority = false,
  sizes,
  iconSize = "md",
}: {
  photo?: ProfilePhoto;
  alt: string;
  variant?: "thumb" | "card" | "full";
  priority?: boolean;
  sizes: string;
  iconSize?: "sm" | "md" | "lg";
}) {
  const primaryUrl = getProfilePhotoUrl(photo, variant);
  const fallbackUrl = getProfilePhotoFallbackUrl(photo, variant);
  const [failedPrimaryUrl, setFailedPrimaryUrl] = useState<string | null>(null);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const [loadedPhotoUrl, setLoadedPhotoUrl] = useState<string | null>(null);
  const shouldUseFallback = Boolean(
    primaryUrl && fallbackUrl && primaryUrl !== fallbackUrl && failedPrimaryUrl === primaryUrl
  );
  const photoUrl = shouldUseFallback ? fallbackUrl : primaryUrl;
  const isLoaded = loadedPhotoUrl === photoUrl;
  const shouldShowImage = priority || isLoaded;
  const hasTerminalFailure = Boolean(photoUrl && failedPhotoUrl === photoUrl);
  const iconClass = iconSize === "lg" ? "size-12" : iconSize === "sm" ? "size-5" : "size-8";

  if (!photoUrl || hasTerminalFailure) {
    return (
      <div className="grid h-full w-full place-items-center text-[#9d2a9e]">
        <Camera className={iconClass} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f6e0f6]">
      {photo?.blurDataUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${photo.blurDataUrl})` }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[#9d2a9e]" aria-hidden="true">
          <Camera className={iconClass} />
        </div>
      )}
      <Image
        key={photoUrl}
        src={photoUrl}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover ${priority ? "opacity-100" : "transition-opacity duration-200"} ${
          shouldShowImage ? "opacity-100" : "opacity-0"
        }`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setLoadedPhotoUrl(photoUrl)}
        onError={() => {
          if (primaryUrl && fallbackUrl && primaryUrl !== fallbackUrl && photoUrl === primaryUrl) {
            if (process.env.NODE_ENV === "development") {
              console.warn("crushclub image failed. Trying signed fallback.", {
                attempted: formatImageUrlForDebug(photoUrl),
                fallback: formatImageUrlForDebug(fallbackUrl),
              });
            }
            setFailedPrimaryUrl(primaryUrl);
            return;
          }

          if (process.env.NODE_ENV === "development") {
            console.warn("crushclub image failed with no remaining fallback.", {
              attempted: formatImageUrlForDebug(photoUrl),
              primary: formatImageUrlForDebug(primaryUrl),
            });
          }
          setFailedPhotoUrl(photoUrl);
        }}
        unoptimized
      />
    </div>
  );
}
