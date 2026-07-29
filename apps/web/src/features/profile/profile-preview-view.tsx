import { ArrowLeft, MapPin, Ticket } from "lucide-react";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import type { ProfilePhoto } from "@/lib/types";

export function ProfilePreviewView({
  attendedEventCount,
  bio,
  displayName,
  interests,
  location,
  photo,
  profileAge,
  statusLabel,
  onBack,
}: {
  attendedEventCount: number;
  bio: string;
  displayName: string;
  interests: string[];
  location: string;
  photo: ProfilePhoto | undefined;
  profileAge: number | null;
  statusLabel: string;
  onBack: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <div className="relative aspect-[4/5] min-h-[420px] bg-[#f6e0f6]">
        <button
          className="absolute left-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white/95 text-[#0d0d0d] shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur"
          type="button"
          onClick={onBack}
          aria-label="Back to profile"
          title="Back"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <ProfilePhotoImage
          photo={photo}
          alt={`${displayName} profile preview`}
          variant="full"
          sizes="(max-width: 768px) 100vw, 430px"
          iconSize="lg"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
              {statusLabel}
            </span>
            {attendedEventCount > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#0d0d0d]"
                aria-label={`${attendedEventCount} attended events`}
                title={`${attendedEventCount} attended events`}
              >
                <Ticket className="size-3.5" aria-hidden="true" />
                {attendedEventCount}
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 text-3xl font-semibold">
            {displayName}
            {profileAge ? `, ${profileAge}` : ""}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-sm font-medium">
            <MapPin className="size-4" aria-hidden="true" />
            {location}
          </p>
        </div>
      </div>
      <div className="p-4">
        {bio ? (
          <p className="text-sm leading-6 text-[#444444]">{bio}</p>
        ) : (
          <p className="text-sm leading-6 text-[#777777]">
            Add a short bio so people know what kind of city link you are looking for.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {interests.slice(0, 5).map((interest) => (
            <span
              key={interest}
              className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]"
            >
              {interest}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
