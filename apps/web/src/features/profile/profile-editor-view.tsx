import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { Camera, LoaderCircle, MapPin, Trash2, X } from "lucide-react";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import {
  PROFILE_INTEREST_LIMIT,
  PROFILE_PHOTO_LIMIT,
  connectionStatusOptions,
  sexualityOptions,
} from "@/lib/profile";
import type { ConnectionStatus, Gender, ProfilePhoto, Sexuality } from "@/lib/types";
import { SUPPORTED_PROFILE_PHOTO_TYPES, type ProfileForm } from "./profile-model";

export function ProfileEditorView({
  adultBirthDateMax,
  canAddMoreInterests,
  canDeletePhoto,
  cityOptions,
  displayName,
  form,
  hasGpsLocation,
  interestQuery,
  isDetectingLocation,
  isSaving,
  isSetupMode,
  nextAvailablePhotoSlot,
  photos,
  profilePhoto,
  selectedInterests,
  stateOptions,
  suggestedInterests,
  uploadingPhotoSlot,
  onAddInterest,
  onChangeForm,
  onChangeInterestQuery,
  onDeletePhoto,
  onDetectLocation,
  onInterestKeyDown,
  onRemoveInterest,
  onSubmit,
  onUploadPhoto,
}: {
  adultBirthDateMax: string;
  canAddMoreInterests: boolean;
  canDeletePhoto: boolean;
  cityOptions: string[];
  displayName: string;
  form: ProfileForm;
  hasGpsLocation: boolean;
  interestQuery: string;
  isDetectingLocation: boolean;
  isSaving: boolean;
  isSetupMode: boolean;
  nextAvailablePhotoSlot: number;
  photos: ProfilePhoto[];
  profilePhoto: ProfilePhoto | undefined;
  selectedInterests: string[];
  stateOptions: string[];
  suggestedInterests: string[];
  uploadingPhotoSlot: number | null;
  onAddInterest: (interest: string) => void;
  onChangeForm: (patch: Partial<ProfileForm>) => void;
  onChangeInterestQuery: (query: string) => void;
  onDeletePhoto: (photo: ProfilePhoto, index: number) => void;
  onDetectLocation: () => void;
  onInterestKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveInterest: (interest: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUploadPhoto: (
    event: ChangeEvent<HTMLInputElement>,
    index: number,
    options?: { replacePhotoId?: string },
  ) => void;
}) {
  const isUploadingPhoto = uploadingPhotoSlot !== null;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <ProfilePhotosEditor
        canDeletePhoto={canDeletePhoto}
        displayName={displayName}
        isUploadingPhoto={isUploadingPhoto}
        nextAvailablePhotoSlot={nextAvailablePhotoSlot}
        photos={photos}
        uploadingPhotoSlot={uploadingPhotoSlot}
        onDeletePhoto={onDeletePhoto}
        onUploadPhoto={onUploadPhoto}
      />

      <section className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <div className="flex items-start gap-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-[18px] bg-[#f6e0f6]">
            <ProfilePhotoImage
              photo={profilePhoto}
              alt={`${displayName} profile`}
              variant="thumb"
              sizes="64px"
              iconSize="sm"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">Profile details</p>
            <p className="mt-1 text-sm text-[#666666]">Used for discovery and matches</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Username">
            <input
              className={inputClassName}
              placeholder="Your display name"
              value={form.displayName}
              onChange={(event) => onChangeForm({ displayName: event.target.value })}
              minLength={2}
              maxLength={80}
              required
            />
          </Field>
          <Field label="Bio">
            <textarea
              className="min-h-24 rounded-[18px] border border-black/[0.08] p-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]"
              placeholder="Tell people a bit about yourself"
              value={form.bio}
              onChange={(event) => onChangeForm({ bio: event.target.value })}
              maxLength={500}
              required={isSetupMode}
            />
          </Field>
          <Field label="Looking for?">
            <select
              className={inputClassName}
              value={form.connectionStatus}
              onChange={(event) =>
                onChangeForm({ connectionStatus: event.target.value as ConnectionStatus | "" })
              }
              required={isSetupMode}
            >
              <option value="" disabled>
                Choose what you are looking for
              </option>
              {connectionStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date of birth">
              <input
                className={inputClassName}
                type="date"
                max={adultBirthDateMax}
                value={form.birthDate}
                onChange={(event) => onChangeForm({ birthDate: event.target.value })}
                required={isSetupMode}
              />
            </Field>
            <Field label="Gender">
              <select
                className={inputClassName}
                value={form.gender}
                onChange={(event) => onChangeForm({ gender: event.target.value as Gender })}
              >
                <option value="WOMAN">Female</option>
                <option value="MAN">Male</option>
                <option value="NON_BINARY">Non-binary</option>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
              </select>
            </Field>
          </div>
          <Field label="Sexuality">
            <select
              className={inputClassName}
              value={form.sexuality}
              onChange={(event) =>
                onChangeForm({ sexuality: event.target.value as Sexuality | "" })
              }
            >
              <option value="">Prefer not to say</option>
              {sexualityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="State">
              <select
                className={inputClassName}
                value={form.state}
                onChange={(event) => onChangeForm({ state: event.target.value, city: "" })}
                required={isSetupMode}
              >
                <option value="" disabled>
                  Choose state
                </option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <select
                className={inputClassName}
                value={form.city}
                onChange={(event) => onChangeForm({ city: event.target.value })}
                disabled={!form.state}
                required={isSetupMode}
              >
                <option value="" disabled>
                  {form.state ? "Choose city" : "Choose state first"}
                </option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="rounded-[18px] border border-black/[0.06] bg-[#fafafa] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0d0d0d]">GPS distance</p>
                <p className="mt-1 text-xs font-medium text-[#666666]">
                  {hasGpsLocation ? "Ready for exact distance" : "Optional for distance"}
                </p>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onDetectLocation}
                disabled={isDetectingLocation || isSaving}
              >
                {isDetectingLocation ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MapPin className="size-4" aria-hidden="true" />
                )}
                {hasGpsLocation ? "Update GPS" : "Use GPS"}
              </button>
            </div>
          </div>
          <InterestsEditor
            canAddMore={canAddMoreInterests}
            interestQuery={interestQuery}
            selectedInterests={selectedInterests}
            suggestedInterests={suggestedInterests}
            onAdd={onAddInterest}
            onChangeQuery={onChangeInterestQuery}
            onKeyDown={onInterestKeyDown}
            onRemove={onRemoveInterest}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isSetupMode ? "Complete setup" : "Save"}
          </button>
        </div>
      </section>
    </form>
  );
}

function ProfilePhotosEditor({
  canDeletePhoto,
  displayName,
  isUploadingPhoto,
  nextAvailablePhotoSlot,
  photos,
  uploadingPhotoSlot,
  onDeletePhoto,
  onUploadPhoto,
}: {
  canDeletePhoto: boolean;
  displayName: string;
  isUploadingPhoto: boolean;
  nextAvailablePhotoSlot: number;
  photos: ProfilePhoto[];
  uploadingPhotoSlot: number | null;
  onDeletePhoto: (photo: ProfilePhoto, index: number) => void;
  onUploadPhoto: (
    event: ChangeEvent<HTMLInputElement>,
    index: number,
    options?: { replacePhotoId?: string },
  ) => void;
}) {
  return (
    <section className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Profile photos</h2>
          <p className="mt-1 text-sm leading-6 text-[#666666]">
            Add one main photo, then up to three more.
          </p>
        </div>
        <span className="rounded-full bg-[#f6e0f6] px-3 py-1 text-xs font-medium text-[#9d2a9e]">
          {Math.min(photos.length, PROFILE_PHOTO_LIMIT)}/{PROFILE_PHOTO_LIMIT}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: PROFILE_PHOTO_LIMIT }).map((_, index) => {
          const photo = photos[index];
          const isOpenSlot =
            !photo && index === nextAvailablePhotoSlot && photos.length < PROFILE_PHOTO_LIMIT;
          const isLockedSlot = !photo && !isOpenSlot;

          return (
            <div
              key={photo?.id ?? `photo-slot-${index}`}
              className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-black/[0.06] bg-[#f6e0f6]"
            >
              {photo ? (
                <ProfilePhotoImage
                  photo={photo}
                  alt={`${displayName} photo ${index + 1}`}
                  variant="card"
                  sizes="(max-width: 640px) 50vw, 160px"
                  iconSize="md"
                />
              ) : (
                <div className="grid h-full place-items-center px-3 text-center text-[#9d2a9e]">
                  <div>
                    <Camera className="mx-auto size-7" aria-hidden="true" />
                    <p className="mt-2 text-xs font-medium">
                      {index === 0 ? "Main photo" : `Photo ${index + 1}`}
                    </p>
                  </div>
                </div>
              )}

              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#0d0d0d]">
                {index === 0 ? "Main" : `Photo ${index + 1}`}
              </span>

              {photo ? (
                <div className="absolute inset-x-2 bottom-2 flex items-center gap-2">
                  <label className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full bg-white/95 px-3 text-xs font-semibold text-[#0d0d0d] shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition hover:bg-white">
                    {uploadingPhotoSlot === index ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      "Replace"
                    )}
                    <input
                      className="sr-only"
                      type="file"
                      accept={SUPPORTED_PROFILE_PHOTO_TYPES.join(",")}
                      onChange={(event) =>
                        onUploadPhoto(event, index, { replacePhotoId: photo.id })
                      }
                      disabled={isUploadingPhoto}
                    />
                  </label>
                  {canDeletePhoto ? (
                    <button
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => onDeletePhoto(photo, index)}
                      disabled={isUploadingPhoto}
                      aria-label={`Remove photo ${index + 1}`}
                      title="Remove photo"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {isOpenSlot ? (
                <label className="absolute inset-0 grid cursor-pointer place-items-center bg-black/10 text-white">
                  {uploadingPhotoSlot === index ? (
                    <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                  ) : (
                    <span className="rounded-full bg-[#0d0d0d] px-3 py-1.5 text-xs font-medium">
                      Add photo
                    </span>
                  )}
                  <input
                    className="sr-only"
                    type="file"
                    accept={SUPPORTED_PROFILE_PHOTO_TYPES.join(",")}
                    onChange={(event) => onUploadPhoto(event, index)}
                    disabled={isUploadingPhoto}
                  />
                </label>
              ) : null}

              {isLockedSlot ? (
                <div className="absolute inset-0 grid place-items-center bg-white/50 px-3 text-center text-[11px] font-medium text-[#777777]">
                  Fill previous slot first
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InterestsEditor({
  canAddMore,
  interestQuery,
  selectedInterests,
  suggestedInterests,
  onAdd,
  onChangeQuery,
  onKeyDown,
  onRemove,
}: {
  canAddMore: boolean;
  interestQuery: string;
  selectedInterests: string[];
  suggestedInterests: string[];
  onAdd: (interest: string) => void;
  onChangeQuery: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRemove: (interest: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="profile-interest-search"
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]"
        >
          Interests
        </label>
        <span className="rounded-full bg-[#f6e0f6] px-3 py-1 text-xs font-semibold text-[#9d2a9e]">
          {selectedInterests.length}/{PROFILE_INTEREST_LIMIT}
        </span>
      </div>

      {selectedInterests.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedInterests.map((interest) => (
            <button
              key={interest}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0d0d0d] px-3 text-sm font-medium text-white"
              type="button"
              onClick={() => onRemove(interest)}
              aria-label={`Remove ${interest}`}
            >
              {interest}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      <input
        id="profile-interest-search"
        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be] disabled:cursor-not-allowed disabled:bg-[#f6f6f6] disabled:text-[#999999]"
        placeholder={canAddMore ? "Search interests" : "Interest limit reached"}
        value={interestQuery}
        onChange={(event) => onChangeQuery(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={!canAddMore}
      />

      {suggestedInterests.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestedInterests.map((interest) => (
            <button
              key={interest}
              className="inline-flex h-9 items-center justify-center rounded-full border border-black/[0.08] bg-white px-3 text-sm font-medium text-[#444444] transition hover:border-[#bd40be] hover:text-[#0d0d0d] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={() => onAdd(interest)}
              disabled={!canAddMore}
            >
              {interest}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
      {label}
      {children}
    </label>
  );
}

const inputClassName =
  "h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#bd40be] focus:ring-1 focus:ring-[#bd40be]";
