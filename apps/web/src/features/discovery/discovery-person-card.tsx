"use client";

import { ActionButton } from "@/components/action-button";
import type { LucideIcon } from "lucide-react";
import { LoaderCircle, MapPin, MessageCircle, PartyPopper, Snowflake, Sparkles, UserRoundSearch, UtensilsCrossed } from "lucide-react";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { formatConnectionStatus } from "@/lib/profile";
import type { ConnectionStatus, PublicDiscoveryPerson } from "@/lib/types";

const statusAppearance: Record<ConnectionStatus, { icon: LucideIcon; className: string }> = {
  CHILL: { icon: Snowflake, className: "text-info" },
  PARTY: { icon: PartyPopper, className: "text-heart" },
  FOODIE: { icon: UtensilsCrossed, className: "text-warning" },
  OPEN_TO_ANYTHING: { icon: Sparkles, className: "text-brand-strong" },
};

export function DiscoveryPersonCard({ person, showState = false, isProfileLoading = false, isProfileDisabled = false, onViewProfile, onMessage }: {
  person: PublicDiscoveryPerson;
  showState?: boolean;
  isProfileLoading?: boolean;
  isProfileDisabled?: boolean;
  onViewProfile: () => void | Promise<void>;
  onMessage: () => void;
}) {
  const appearance = person.connectionStatus
    ? statusAppearance[person.connectionStatus]
    : { icon: Sparkles, className: "text-ink-500" };
  const StatusIcon = appearance.icon;

  return (
    <article className="flex min-w-0 items-center gap-3 rounded-[22px] border border-line/[0.05] bg-surface p-3 shadow-[0_2px_6px_rgba(0,0,0,0.03)] md:gap-4 md:p-4 md:transition md:hover:border-brand/20 md:hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
      <button
        type="button"
        className="relative size-16 shrink-0 overflow-hidden rounded-[18px] bg-brand-tint md:size-20"
        onClick={onViewProfile}
        disabled={isProfileDisabled}
        aria-busy={isProfileLoading}
        aria-label={`View ${person.displayName} profile`}
      >
        <ProfilePhotoImage photo={person.photos[0]} alt={`${person.displayName} profile`} variant="thumb" sizes="96px" />
        {isProfileLoading ? (
          <span className="absolute inset-0 grid place-items-center bg-surface-shade/80 text-ink-600">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          </span>
        ) : null}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left disabled:opacity-60" onClick={onViewProfile} disabled={isProfileDisabled} aria-busy={isProfileLoading}>
        <h3 className="flex items-center gap-1.5 text-base font-semibold">
          <span className="truncate">{person.displayName}{person.age ? `, ${person.age}` : ""}</span>
        </h3>
        {showState && person.state ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{person.state}</span>
          </p>
        ) : null}
        <p className={`mt-1 flex items-center gap-1 text-xs font-semibold md:mt-2 ${appearance.className}`}>
          <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{formatConnectionStatus(person.connectionStatus)}</span>
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <ActionButton
          isLoading={isProfileLoading}
          disabled={isProfileDisabled}
          icon={<UserRoundSearch className="size-4" aria-hidden="true" />}
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-full border border-line/[0.08] text-ink transition hover:border-line/[0.16] hover:bg-surface-muted"
          onClick={onViewProfile}
          aria-label={`View ${person.displayName} profile`}
          title="View profile"
        >
        </ActionButton>
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-full bg-brand-solid text-white transition hover:bg-brand-solid/85"
          onClick={onMessage}
          disabled={isProfileDisabled}
          aria-label={`Message ${person.displayName}`}
          title="Message"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
