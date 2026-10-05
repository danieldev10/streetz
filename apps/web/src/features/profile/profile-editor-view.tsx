import { ActionButton } from "@/components/action-button";
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { Camera, LoaderCircle, MapPin, Sparkles, X } from "lucide-react";
import { CustomSelect } from "@/components/custom-select";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import {
  PROFILE_INTEREST_LIMIT,
  connectionStatusOptions,
  sexualityOptions,
} from "@/lib/profile";
import type { ConnectionStatus, Gender, ProfilePhoto, Sexuality } from "@/lib/types";
import { SUPPORTED_PROFILE_PHOTO_TYPES, type ProfileForm } from "./profile-model";

export function ProfileEditorView({
  adultBirthDateMax,
  canAddMoreInterests,
  cityOptions,
  displayName,
  form,
  hasGpsLocation,
  interestQuery,
  isDetectingLocation,
  isSaving,
  isSetupMode,
  profilePhoto,
  selectedInterests,
  stateOptions,
  suggestedInterests,
  uploadingPhotoSlot,
  onAddInterest,
  onChangeForm,
  onChangeInterestQuery,
  onDetectLocation,
  onInterestKeyDown,
  onRemoveInterest,
  onSubmit,
  onUploadPhoto,
}: {
  adultBirthDateMax: string;
  canAddMoreInterests: boolean;
  cityOptions: string[];
  displayName: string;
  form: ProfileForm;
  hasGpsLocation: boolean;
  interestQuery: string;
  isDetectingLocation: boolean;
  isSaving: boolean;
  isSetupMode: boolean;
  profilePhoto: ProfilePhoto | undefined;
  selectedInterests: string[];
  stateOptions: string[];
  suggestedInterests: string[];
  uploadingPhotoSlot: number | null;
  onAddInterest: (interest: string) => void;
  onChangeForm: (patch: Partial<ProfileForm>) => void;
  onChangeInterestQuery: (query: string) => void;
  onDetectLocation: () => void;
  onInterestKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveInterest: (interest: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUploadPhoto: (event: ChangeEvent<HTMLInputElement>, index?: number) => void;
}) {
  const isUploadingPhoto = uploadingPhotoSlot !== null;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <ProfilePhotosEditor
        displayName={displayName}
        isUploadingPhoto={isUploadingPhoto}
        photo={profilePhoto}
        uploadingPhotoSlot={uploadingPhotoSlot}
        onUploadPhoto={onUploadPhoto}
      />

      <section className="rounded-[24px] border border-black/[0.05] bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
        <div className="flex items-start gap-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-[18px] bg-brand-tint">
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
            <p className="mt-1 text-sm text-ink-600">Used for discovery and matches</p>
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
              className="min-h-24 rounded-[18px] border border-black/[0.08] p-4 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="Tell people a bit about yourself"
              value={form.bio}
              onChange={(event) => onChangeForm({ bio: event.target.value })}
              maxLength={500}
              required={isSetupMode}
            />
          </Field>
          {isSetupMode ? (
            <CustomSelect
              label="Status"
              value={form.connectionStatus}
              options={connectionStatusOptions}
              onChange={(connectionStatus: ConnectionStatus) => onChangeForm({ connectionStatus })}
              icon={Sparkles}
              placeholder="Choose your status"
            />
          ) : null}
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
          <div className="rounded-[18px] border border-black/[0.06] bg-surface-muted p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">GPS distance</p>
                <p className="mt-1 text-xs font-medium text-ink-600">
                  {hasGpsLocation ? "Ready for exact distance" : "Optional for distance"}
                </p>
              </div>
              <ActionButton
                isLoading={isDetectingLocation} icon={<MapPin className="size-4" aria-hidden="true" />}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-surface px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onDetectLocation}
                disabled={isDetectingLocation || isSaving}
              >
                {hasGpsLocation ? "Update GPS" : "Use GPS"}
              </ActionButton>
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
          <ActionButton
            isLoading={isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            {isSetupMode ? "Complete setup" : "Save"}
          </ActionButton>
        </div>
      </section>
    </form>
  );
}

function ProfilePhotosEditor({
  displayName,
  isUploadingPhoto,
  photo,
  uploadingPhotoSlot,
  onUploadPhoto,
}: {
  displayName: string;
  isUploadingPhoto: boolean;
  photo: ProfilePhoto | undefined;
  uploadingPhotoSlot: number | null;
  onUploadPhoto: (event: ChangeEvent<HTMLInputElement>, index?: number) => void;
}) {
  return (
    <section className="rounded-[24px] border border-black/[0.05] bg-surface p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Profile photo</h2>
          <p className="mt-1 text-sm leading-6 text-ink-600">
            This is the photo people will see across Crushclub.
          </p>
        </div>
        <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand-strong">
          {photo ? "1/1" : "0/1"}
        </span>
      </div>

      <div className="mt-4 max-w-[240px]">
        <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-black/[0.06] bg-brand-tint">
          {photo ? (
            <ProfilePhotoImage
              photo={photo}
              alt={`${displayName} profile photo`}
              variant="card"
              sizes="240px"
              iconSize="md"
            />
          ) : (
            <div className="grid h-full place-items-center px-3 text-center text-brand-strong">
              <div>
                <Camera className="mx-auto size-7" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium">Profile photo</p>
              </div>
            </div>
          )}

          <label className="action-button absolute inset-x-3 bottom-3 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full bg-surface/95 px-3 text-xs font-semibold text-ink shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition hover:bg-surface" aria-busy={isUploadingPhoto}>
            {uploadingPhotoSlot === 0 ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {photo ? "Replace photo" : "Add photo"}
            <input
              className="sr-only"
              type="file"
              accept={SUPPORTED_PROFILE_PHOTO_TYPES.join(",")}
              onChange={(event) => onUploadPhoto(event, 0)}
              disabled={isUploadingPhoto}
            />
          </label>
        </div>
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
          className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-400"
        >
          Interests
        </label>
        <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand-strong">
          {selectedInterests.length}/{PROFILE_INTEREST_LIMIT}
        </span>
      </div>

      {selectedInterests.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedInterests.map((interest) => (
            <button
              key={interest}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-3 text-sm font-medium text-white"
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
        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-300"
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
              className="inline-flex h-9 items-center justify-center rounded-full border border-black/[0.08] bg-surface px-3 text-sm font-medium text-ink-700 transition hover:border-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
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
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
      {label}
      {children}
    </label>
  );
}

const inputClassName =
  "h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand";
