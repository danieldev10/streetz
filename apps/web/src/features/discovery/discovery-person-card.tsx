"use client";

import type { LucideIcon } from "lucide-react";
import { MapPin, MessageCircle, PartyPopper, Snowflake, Sparkles, UserRoundSearch, UtensilsCrossed } from "lucide-react";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { formatConnectionStatus } from "@/lib/profile";
import type { ConnectionStatus, PublicDiscoveryPerson } from "@/lib/types";

const statusAppearance: Record<ConnectionStatus, { icon: LucideIcon; className: string }> = {
  CHILL: { icon: Snowflake, className: "text-sky-600" },
  PARTY: { icon: PartyPopper, className: "text-rose-600" },
  FOODIE: { icon: UtensilsCrossed, className: "text-amber-600" },
  OPEN_TO_ANYTHING: { icon: Sparkles, className: "text-violet-600" },
};

export function DiscoveryPersonCard({ person, showState = false, onViewProfile, onMessage }: {
  person: PublicDiscoveryPerson;
  showState?: boolean;
  onViewProfile: () => void;
  onMessage: () => void;
}) {
  const appearance = person.connectionStatus
    ? statusAppearance[person.connectionStatus]
    : { icon: Sparkles, className: "text-ink-500" };
  const StatusIcon = appearance.icon;

  return (
    <article className="flex min-w-0 items-center gap-3 rounded-[22px] border border-black/[0.05] bg-surface p-3 shadow-[0_2px_6px_rgba(0,0,0,0.03)]">
      <button
        type="button"
        className="relative size-16 shrink-0 overflow-hidden rounded-[18px] bg-brand-tint"
        onClick={onViewProfile}
        aria-label={`View ${person.displayName} profile`}
      >
        <ProfilePhotoImage photo={person.photos[0]} alt={`${person.displayName} profile`} variant="thumb" sizes="96px" />
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onViewProfile}>
        <h3 className="truncate text-base font-semibold">{person.displayName}{person.age ? `, ${person.age}` : ""}</h3>
        {showState && person.state ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{person.state}</span>
          </p>
        ) : null}
        <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${appearance.className}`}>
          <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{formatConnectionStatus(person.connectionStatus)}</span>
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] text-ink transition hover:border-black/[0.16] hover:bg-surface-muted"
          onClick={onViewProfile}
          aria-label={`View ${person.displayName} profile`}
          title="View profile"
        >
          <UserRoundSearch className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-full bg-brand-strong text-white transition hover:bg-brand-deep"
          onClick={onMessage}
          aria-label={`Message ${person.displayName}`}
          title="Message"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
