import type { FormEvent, ReactNode } from "react";
import {
  Camera,
  Heart,
  LoaderCircle,
  MapPin,
  Power,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth-constraints";
import { PROFILE_PHOTO_LIMIT, formatSexuality } from "@/lib/profile";
import type { ProfilePhoto, Sexuality } from "@/lib/types";

export function ProfileOverviewView({
  activePhoto,
  activePhotoIndex,
  attendedEventCount,
  bio,
  deleteAccountPassword,
  displayName,
  interests,
  isDeactivateConfirmOpen,
  isDeleteAccountOpen,
  isFaceVerified,
  isSubmittingAccountAction,
  location,
  photos,
  profileAge,
  sexuality,
  statusLabel,
  onChangeActivePhoto,
  onChangeDeletePassword,
  onCloseDeactivate,
  onDeactivate,
  onDeleteAccount,
  onEdit,
  onOpenDeactivate,
  onOpenDeleteAccount,
  onOpenDiscoveryPreferences,
  onPreview,
}: {
  activePhoto: ProfilePhoto | undefined;
  activePhotoIndex: number;
  attendedEventCount: number;
  bio: string;
  deleteAccountPassword: string;
  displayName: string;
  interests: string[];
  isDeactivateConfirmOpen: boolean;
  isDeleteAccountOpen: boolean;
  isFaceVerified: boolean;
  isSubmittingAccountAction: boolean;
  location: string;
  photos: ProfilePhoto[];
  profileAge: number | null;
  sexuality: Sexuality | "";
  statusLabel: string;
  onChangeActivePhoto: (index: number) => void;
  onChangeDeletePassword: (password: string) => void;
  onCloseDeactivate: () => void;
  onDeactivate: () => void;
  onDeleteAccount: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: () => void;
  onOpenDeactivate: () => void;
  onOpenDeleteAccount: () => void;
  onOpenDiscoveryPreferences: () => void;
  onPreview: () => void;
}) {
  const sexualityLabel = formatSexuality(sexuality || null);

  return (
    <>
      <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
        <div className="relative aspect-[1.05] min-h-[320px] bg-[#f6e0f6]">
          <ProfilePhotoImage
            photo={activePhoto}
            alt={`${displayName} profile`}
            variant="full"
            sizes="(max-width: 768px) 100vw, 520px"
            iconSize="lg"
          />
          <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
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
        </div>

        <div className="grid grid-cols-4 gap-2 p-3">
          {Array.from({ length: PROFILE_PHOTO_LIMIT }).map((_, index) => {
            const photo = photos[index];
            const isActive = index === activePhotoIndex;

            return photo ? (
              <button
                key={photo.id}
                className={`relative aspect-square overflow-hidden rounded-[16px] border ${
                  isActive
                    ? "border-[#bd40be] ring-2 ring-[#bd40be]/30"
                    : "border-black/[0.06]"
                }`}
                type="button"
                onClick={() => onChangeActivePhoto(index)}
                aria-label={`Show photo ${index + 1}`}
              >
                <ProfilePhotoImage
                  photo={photo}
                  alt={`${displayName} thumbnail ${index + 1}`}
                  variant="thumb"
                  sizes="96px"
                  iconSize="sm"
                />
              </button>
            ) : (
              <div
                key={`empty-overview-photo-${index}`}
                className="grid aspect-square place-items-center rounded-[16px] border border-dashed border-black/[0.12] bg-[#fafafa] text-[#999999]"
              >
                <Camera className="size-4" aria-hidden="true" />
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-5 pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-3xl font-semibold text-[#0d0d0d]">
                {displayName}
                {profileAge ? `, ${profileAge}` : ""}
              </h2>
              <p className="mt-2 flex items-center gap-1 text-sm font-medium text-[#666666]">
                <MapPin className="size-4" aria-hidden="true" />
                {location}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#f6e0f6] px-3 py-1 text-xs font-medium text-[#9d2a9e]">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
            </span>
          </div>

          <ProfileDetail label="Status">{statusLabel}</ProfileDetail>
          {sexualityLabel ? <ProfileDetail label="Sexuality">{sexualityLabel}</ProfileDetail> : null}
          <ProfileDetail label="Bio">
            {bio || "Add a short bio so people know what kind of city link you are looking for."}
          </ProfileDetail>

          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">
              Interests
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {interests.length > 0 ? (
                interests.slice(0, 8).map((interest) => (
                  <span
                    key={interest}
                    className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]"
                  >
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

      <div className="mt-5 grid gap-3">
        <ActionButton onClick={onOpenDiscoveryPreferences}>
          <Heart className="size-4" aria-hidden="true" />
          Discovery preferences
        </ActionButton>
        {isFaceVerified ? (
          <div className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#f6e0f6] px-5 text-sm font-medium text-[#9d2a9e]">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Live Verified
          </div>
        ) : (
          <a
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#bd40be]/40 bg-[#f6e0f6] px-5 text-sm font-medium text-[#7c1f7d]"
            href="/profile/verify"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Verify Profile
          </a>
        )}
        <ActionButton onClick={onPreview}>
          <Heart className="size-4" aria-hidden="true" />
          Preview Card
        </ActionButton>
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
          type="button"
          onClick={onEdit}
        >
          <UserRound className="size-4" aria-hidden="true" />
          Edit Profile
        </button>
        <ActionButton onClick={onOpenDeactivate}>
          <Power className="size-4" aria-hidden="true" />
          Deactivate Profile
        </ActionButton>
        {isDeleteAccountOpen ? (
          <form onSubmit={onDeleteAccount} className="grid gap-3 rounded-[20px] border border-red-200 p-4">
            <label className="grid gap-2 text-sm font-medium">
              Password
              <input
                className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                type="password"
                value={deleteAccountPassword}
                onChange={(event) => onChangeDeletePassword(event.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                required
              />
            </label>
            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-red-600 px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-55"
              type="submit"
              disabled={isSubmittingAccountAction}
            >
              {isSubmittingAccountAction ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Delete Profile
            </button>
          </form>
        ) : (
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 text-sm font-medium text-red-600"
            type="button"
            onClick={onOpenDeleteAccount}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete Profile
          </button>
        )}
      </div>

      {isDeactivateConfirmOpen ? (
        <DeactivateProfileDialog
          isSubmitting={isSubmittingAccountAction}
          onCancel={onCloseDeactivate}
          onConfirm={onDeactivate}
        />
      ) : null}
    </>
  );
}

function ProfileDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[#444444]">{children}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-5 text-sm font-medium text-[#0d0d0d]"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DeactivateProfileDialog({
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 px-5" role="presentation">
      <section
        className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deactivate-confirm-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="deactivate-confirm-title" className="text-xl font-semibold">
              Deactivate profile?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#666666]">
              Your profile will be hidden from discovery and you will be logged out. You can
              reactivate anytime by logging back in.
            </p>
          </div>
          <button
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08]"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close"
            title="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Deactivate
          </button>
        </div>
      </section>
    </div>
  );
}
