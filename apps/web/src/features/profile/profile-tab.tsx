"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Heart, LoaderCircle, MapPin, Power, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { useSession } from "@/components/app/session-provider";
import { ProfilePhotoImage } from "@/components/profile-photo-image";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth-constraints";
import { PROFILE_PHOTO_UPLOAD_MAX_BYTES, prepareImageForUpload } from "@/lib/image-upload";
import { DEFAULT_DISCOVERY_DISTANCE_KM, getCurrentBrowserCoordinates, getLocationPermissionMessage, type ReverseGeocodeSuggestion } from "@/lib/location";
import { getCitiesForState, nigeriaStateNames, normalizeLocationSuggestion } from "@/lib/nigeria-locations";
import {
  PROFILE_PHOTO_LIMIT,
  connectionStatusOptions,
  formatConnectionStatus,
  formatProfileSetupIssues,
  formatSexuality,
  getAdultBirthDateMaxValue,
  getAgeFromBirthDate,
  getBirthDateValidationMessage,
  getProfileSetupIssues,
  getProfileSetupIssuesFromForm,
  isProfileReadyForDiscovery,
  sexualityOptions,
} from "@/lib/profile";
import type { ConnectionStatus, Gender, ProfilePhoto, ProfileTabMode, Sexuality, StreetzProfile, StreetzUser } from "@/lib/types";

const SUPPORTED_PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function ProfileTab({
  token,
  user,
  mode = "normal",
  setupNotice,
  onProfileReady,
}: {
  token: string;
  user: StreetzUser;
  mode?: ProfileTabMode;
  setupNotice?: string | null;
  onProfileReady?: (profile: StreetzProfile) => void;
}) {
  const { updateSessionUser, logout } = useSession();
  const isSetupMode = mode === "setup";
  const [profile, setProfile] = useState<StreetzProfile | null>(null);
  const [profileView, setProfileView] = useState<"overview" | "edit" | "preview">(
    isSetupMode ? "edit" : "overview"
  );
  const [activeProfilePhotoIndex, setActiveProfilePhotoIndex] = useState(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [uploadingPhotoSlot, setUploadingPhotoSlot] = useState<number | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmittingAccountAction, setIsSubmittingAccountAction] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [profileForm, setProfileForm] = useState({
    bio: "",
    birthDate: "",
    gender: "PREFER_NOT_TO_SAY" as Gender,
    sexuality: "" as Sexuality | "",
    connectionStatus: "" as ConnectionStatus | "",
    city: "",
    state: "",
    latitude: null as number | null,
    longitude: null as number | null,
    locationAccuracyMeters: null as number | null,
    locationUpdatedAt: null as string | null,
    maxDistanceKm: DEFAULT_DISCOVERY_DISTANCE_KM,
    interests: "",
  });

  const profilePhotos = profile?.user.photos ?? [];
  const visibleProfilePhotos = profilePhotos.slice(0, PROFILE_PHOTO_LIMIT);
  const profilePhoto = visibleProfilePhotos[0];
  const safeActiveProfilePhotoIndex =
    activeProfilePhotoIndex < visibleProfilePhotos.length ? activeProfilePhotoIndex : 0;
  const activeProfilePhoto = visibleProfilePhotos[safeActiveProfilePhotoIndex] ?? profilePhoto;
  const isUploadingPhoto = uploadingPhotoSlot !== null;
  const canDeleteProfilePhoto = visibleProfilePhotos.length > 1;
  const nextAvailablePhotoSlot = Math.min(visibleProfilePhotos.length, PROFILE_PHOTO_LIMIT - 1);
  const profileAge = getAgeFromBirthDate(profileForm.birthDate);
  const adultBirthDateMax = getAdultBirthDateMaxValue();
  const profileLocation = [profileForm.city, profileForm.state].filter(Boolean).join(", ") || "Nigeria";
  const hasGpsLocation = profileForm.latitude !== null && profileForm.longitude !== null;
  const profileStatusLabel = profileForm.connectionStatus ? formatConnectionStatus(profileForm.connectionStatus) : "Set status";
  const stateOptions = profileForm.state && !nigeriaStateNames.includes(profileForm.state)
    ? [...nigeriaStateNames, profileForm.state]
    : nigeriaStateNames;
  const knownCityOptions = getCitiesForState(profileForm.state);
  const cityOptions = profileForm.city && !knownCityOptions.includes(profileForm.city)
    ? [...knownCityOptions, profileForm.city]
    : knownCityOptions;
  const previewInterests = profileForm.interests
    .split(",")
    .map((interest) => interest.trim())
    .filter(Boolean);

  function syncProfileForm(profileResponse: StreetzProfile) {
    setProfileForm({
      bio: profileResponse.bio ?? "",
      birthDate: profileResponse.birthDate ? profileResponse.birthDate.slice(0, 10) : "",
      gender: profileResponse.gender ?? "PREFER_NOT_TO_SAY",
      sexuality: profileResponse.sexuality ?? "",
      connectionStatus: profileResponse.connectionStatus ?? "",
      city: profileResponse.city ?? "",
      state: profileResponse.state ?? "",
      latitude: profileResponse.latitude ?? null,
      longitude: profileResponse.longitude ?? null,
      locationAccuracyMeters: profileResponse.locationAccuracyMeters ?? null,
      locationUpdatedAt: profileResponse.locationUpdatedAt ?? null,
      maxDistanceKm: profileResponse.maxDistanceKm ?? DEFAULT_DISCOVERY_DISTANCE_KM,
      interests: profileResponse.interests.join(", "),
    });
  }

  async function loadProfile(
    options: { clearNotice?: boolean; showLoading?: boolean; syncForm?: boolean } = {},
  ) {
    const { clearNotice = true, showLoading = true, syncForm = true } = options;

    if (showLoading) {
      setIsLoadingProfile(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      const profileResponse = await apiRequest<StreetzProfile | null>("/profiles/me", {
        headers: authHeaders(token),
      });

      setProfile(profileResponse);

      if (profileResponse) {
        if (syncForm) {
          syncProfileForm(profileResponse);
        }

        if (isSetupMode) {
          setProfileView("edit");
        }
      }
    } catch (error) {
      if (clearNotice) {
        setNotice(getUserErrorMessage(error));
      }
    } finally {
      if (showLoading) {
        setIsLoadingProfile(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!setupNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setNotice(setupNotice);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [setupNotice]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const birthDateMessage = getBirthDateValidationMessage(profileForm.birthDate, { required: isSetupMode });

    if (birthDateMessage) {
      setNotice(birthDateMessage);
      return;
    }

    const interests = profileForm.interests
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean);

    if (profileForm.bio.length > 500) {
      setNotice("Bio must be 500 characters or fewer.");
      return;
    }

    if (profileForm.city.length > 80 || profileForm.state.length > 80) {
      setNotice("City and state must be 80 characters or fewer.");
      return;
    }

    if (interests.length > 12) {
      setNotice("You can add up to 12 interests.");
      return;
    }

    if (interests.some((interest) => interest.length > 32)) {
      setNotice("Each interest must be 32 characters or fewer.");
      return;
    }

    if (isSetupMode) {
      const setupIssues = getProfileSetupIssuesFromForm(profileForm, visibleProfilePhotos.length);

      if (setupIssues.length > 0) {
        setNotice(`To continue, ${formatProfileSetupIssues(setupIssues)}.`);
        return;
      }
    }

    setIsSavingProfile(true);

    try {
      const locationPayload =
        profileForm.latitude !== null && profileForm.longitude !== null
          ? {
              latitude: profileForm.latitude,
              longitude: profileForm.longitude,
              locationAccuracyMeters: profileForm.locationAccuracyMeters ?? undefined,
            }
          : {};
      const savedProfile = await apiRequest<StreetzProfile>("/profiles/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({
          bio: profileForm.bio,
          birthDate: profileForm.birthDate || undefined,
          gender: profileForm.gender,
          sexuality: profileForm.sexuality || undefined,
          connectionStatus: profileForm.connectionStatus || undefined,
          city: profileForm.city,
          state: profileForm.state,
          ...locationPayload,
          maxDistanceKm: profileForm.maxDistanceKm,
          interests,
        }),
      });

      setProfile(savedProfile);
      syncProfileForm(savedProfile);

      if (isSetupMode) {
        if (!isProfileReadyForDiscovery(savedProfile)) {
          const setupIssues = getProfileSetupIssues(savedProfile);
          setNotice(`To continue, ${formatProfileSetupIssues(setupIssues)}.`);
          return;
        }

        onProfileReady?.(savedProfile);
        return;
      }

      setProfileView("overview");
      setNotice("Profile saved.");
      void loadProfile({ clearNotice: false, showLoading: false });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function detectProfileLocation() {
    setIsDetectingLocation(true);
    setNotice(null);

    try {
      const coordinates = await getCurrentBrowserCoordinates();
      let locationNotice = "GPS location captured. Save your profile to use exact distance in Discovery.";
      let suggestedCity = "";
      let suggestedState = "";

      try {
        const suggestion = await apiRequest<ReverseGeocodeSuggestion>("/profiles/location/reverse-geocode", {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          }),
        });
        const normalizedLocation = normalizeLocationSuggestion(suggestion);

        suggestedCity = normalizedLocation.city;
        suggestedState = normalizedLocation.state;

        if (suggestedCity && suggestedState) {
          locationNotice = `GPS location captured as ${suggestedCity}, ${suggestedState}. Save your profile to use exact distance in Discovery.`;
        } else {
          locationNotice = "GPS location captured, but we could not auto-fill city and state. Choose them manually before saving.";
        }
      } catch (error) {
        locationNotice = `GPS location captured, but city/state lookup failed: ${getUserErrorMessage(error)}`;
      }

      setProfileForm((current) => ({
        ...current,
        city: suggestedCity || current.city,
        state: suggestedState || current.state,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        locationAccuracyMeters: coordinates.accuracy,
        locationUpdatedAt: new Date().toISOString(),
      }));
      setNotice(locationNotice);
    } catch (error) {
      setNotice(getLocationPermissionMessage(error));
    } finally {
      setIsDetectingLocation(false);
    }
  }

  async function uploadProfilePhoto(
    event: ChangeEvent<HTMLInputElement>,
    sortOrder = nextAvailablePhotoSlot,
    options: { replacePhotoId?: string } = {}
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const isReplacingPhoto = Boolean(options.replacePhotoId);

    if (!file) {
      return;
    }

    if (!isReplacingPhoto && visibleProfilePhotos.length >= PROFILE_PHOTO_LIMIT) {
      setNotice(`You can add up to ${PROFILE_PHOTO_LIMIT} profile photos.`);
      input.value = "";
      return;
    }

    if (!SUPPORTED_PROFILE_PHOTO_TYPES.includes(file.type as (typeof SUPPORTED_PROFILE_PHOTO_TYPES)[number])) {
      setNotice("Only JPG, PNG, and WebP profile photos are supported.");
      input.value = "";
      return;
    }

    if (file.name.length > 160) {
      setNotice("Photo file name must be 160 characters or fewer.");
      input.value = "";
      return;
    }

    setUploadingPhotoSlot(sortOrder);
    setNotice(null);

    try {
      const uploadFile = await prepareImageForUpload(file, {
        maxBytes: PROFILE_PHOTO_UPLOAD_MAX_BYTES,
        maxDimension: 1600,
        quality: 0.84,
      });

      if (uploadFile.name.length > 160) {
        throw new Error("Photo file name must be 160 characters or fewer.");
      }

      const upload = await apiRequest<{
        uploadUrl: string;
        objectKey: string;
      }>("/profiles/photos/presign", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          fileName: uploadFile.name,
          contentType: uploadFile.type,
          fileSizeBytes: uploadFile.size,
        }),
      });

      const uploadResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": uploadFile.type,
        },
        body: uploadFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("S3 rejected the photo upload. Check the bucket CORS settings.");
      }

      if (options.replacePhotoId) {
        await apiRequest<{ deleted: boolean }>(`/profiles/photos/${encodeURIComponent(options.replacePhotoId)}`, {
          method: "DELETE",
          headers: authHeaders(token),
        });
      }

      await apiRequest<ProfilePhoto>("/profiles/photos", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          objectKey: upload.objectKey,
          sortOrder,
        }),
      });

      setActiveProfilePhotoIndex(Math.min(sortOrder, PROFILE_PHOTO_LIMIT - 1));
      setNotice(isReplacingPhoto ? "Photo updated." : "Photo added to your profile.");
      await loadProfile({ clearNotice: false, showLoading: false, syncForm: false });
    } catch (error) {
      const message = getUserErrorMessage(error);
      setNotice(
        message === "Failed to fetch"
          ? "S3 upload failed. Add localhost to the bucket CORS settings, then try again."
          : message
      );
    } finally {
      setUploadingPhotoSlot(null);
      input.value = "";
    }
  }

  async function deleteProfilePhoto(photo: ProfilePhoto, index: number) {
    if (!canDeleteProfilePhoto) {
      setNotice("Your profile needs at least one photo.");
      return;
    }

    if (isUploadingPhoto) {
      return;
    }

    setUploadingPhotoSlot(index);
    setNotice(null);

    try {
      await apiRequest<{ deleted: boolean }>(`/profiles/photos/${encodeURIComponent(photo.id)}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });

      setActiveProfilePhotoIndex((currentIndex) => {
        if (currentIndex === index) {
          return Math.max(index - 1, 0);
        }

        if (currentIndex > index) {
          return currentIndex - 1;
        }

        return currentIndex;
      });
      setNotice("Photo removed from your profile.");
      await loadProfile({ clearNotice: false, showLoading: false, syncForm: false });
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setUploadingPhotoSlot(null);
    }
  }

  function closeProfileEditor() {
    if (profile) {
      syncProfileForm(profile);
    }

    setProfileView("overview");
    setNotice(null);
  }

  async function deactivateAccount() {
    setIsSubmittingAccountAction(true);
    setNotice(null);

    try {
      const nextUser = await apiRequest<StreetzUser>("/auth/account/deactivate", {
        method: "POST",
        headers: authHeaders(token),
      });

      updateSessionUser(() => nextUser);
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSubmittingAccountAction(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (deleteAccountPassword.length < PASSWORD_MIN_LENGTH) {
      setNotice("Enter your password to delete your account.");
      return;
    }

    if (deleteAccountPassword.length > PASSWORD_MAX_LENGTH) {
      setNotice(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setIsSubmittingAccountAction(true);
    setNotice(null);

    try {
      await apiRequest<{ deleted: boolean }>("/auth/account/delete", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ password: deleteAccountPassword }),
      });
      logout();
    } catch (error) {
      setNotice(getUserErrorMessage(error));
    } finally {
      setIsSubmittingAccountAction(false);
    }
  }

  return (
    <section>
      {profileView === "overview" && !isSetupMode ? (
        <ScreenHeader
          eyebrow="Profile"
          title=""
          action={
            <div className="hidden items-center rounded-full bg-[#d4fae8] px-4 py-2 text-sm font-medium text-[#0fa76e] md:inline-flex">
              Discoverable
            </div>
          }
        />
      ) : profileView === "preview" && !isSetupMode ? null : (
        <>
          {!isSetupMode ? (
            <div className="px-5 pt-5 md:px-8 md:pt-8">
              <button
                className="inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#0d0d0d]"
                onClick={closeProfileEditor}
                aria-label="Back to profile"
                title="Back"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <ScreenHeader
            eyebrow={isSetupMode ? "Profile setup" : "Profile"}
            title={
              isSetupMode
                ? ""
                : ""
            }
          />
        </>
      )}

      <div className="px-5 pb-24 md:px-8 md:pb-8">
        {notice ? <p className="mb-4 rounded-[16px] bg-[#d4fae8] p-3 text-sm font-medium text-[#0b7a50]">{notice}</p> : null}

        {isLoadingProfile ? (
          <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-black/[0.05]">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-7 animate-spin text-[#18E299]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#666666]">Loading profile</p>
            </div>
          </div>
        ) : (
          <div className={profileView === "edit" ? "mx-auto max-w-2xl" : "mx-auto max-w-[520px]"}>
            {profileView === "edit" ? (
              <form onSubmit={saveProfile} className="space-y-5">
                <section className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Profile photos</h2>
                      <p className="mt-1 text-sm leading-6 text-[#666666]">Add one main photo, then up to three more.</p>
                    </div>
                    <span className="rounded-full bg-[#d4fae8] px-3 py-1 text-xs font-medium text-[#0fa76e]">
                      {Math.min(visibleProfilePhotos.length, PROFILE_PHOTO_LIMIT)}/{PROFILE_PHOTO_LIMIT}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: PROFILE_PHOTO_LIMIT }).map((_, index) => {
                      const photo = visibleProfilePhotos[index];
                      const isOpenSlot = !photo && index === nextAvailablePhotoSlot && visibleProfilePhotos.length < PROFILE_PHOTO_LIMIT;
                      const isLockedSlot = !photo && !isOpenSlot;

                      return (
                        <div
                          key={photo?.id ?? `photo-slot-${index}`}
                          className="relative aspect-[3/4] overflow-hidden rounded-[20px] border border-black/[0.06] bg-[#d4fae8]"
                        >
                          {photo ? (
                            <ProfilePhotoImage
                              photo={photo}
                              alt={`${user.displayName} photo ${index + 1}`}
                              variant="card"
                              sizes="(max-width: 640px) 50vw, 160px"
                              iconSize="md"
                            />
                          ) : (
                            <div className="grid h-full place-items-center px-3 text-center text-[#0fa76e]">
                              <div>
                                <Camera className="mx-auto size-7" aria-hidden="true" />
                                <p className="mt-2 text-xs font-medium">{index === 0 ? "Main photo" : `Photo ${index + 1}`}</p>
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
                                  onChange={(event) => uploadProfilePhoto(event, index, { replacePhotoId: photo.id })}
                                  disabled={isUploadingPhoto}
                                />
                              </label>
                              {canDeleteProfilePhoto ? (
                                <button
                                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                  type="button"
                                  onClick={() => void deleteProfilePhoto(photo, index)}
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
                                <span className="rounded-full bg-[#0d0d0d] px-3 py-1.5 text-xs font-medium">Add photo</span>
                              )}
                              <input
                                className="sr-only"
                                type="file"
                                accept={SUPPORTED_PROFILE_PHOTO_TYPES.join(",")}
                                onChange={(event) => uploadProfilePhoto(event, index)}
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

                <section className="rounded-[24px] border border-black/[0.05] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.03)]">
                  <div className="flex items-start gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-[18px] bg-[#d4fae8]">
                      <ProfilePhotoImage photo={profilePhoto} alt={`${user.displayName} profile`} variant="thumb" sizes="64px" iconSize="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold">Profile details</p>
                      <p className="mt-1 text-sm text-[#666666]">Used for discovery and matches</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      Bio
                      <textarea
                        className="min-h-24 rounded-[18px] border border-black/[0.08] p-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        placeholder="Tell people a bit about yourself"
                        value={profileForm.bio}
                        onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))}
                        maxLength={500}
                        required={isSetupMode}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      Connection status
                      <select
                        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        value={profileForm.connectionStatus}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            connectionStatus: event.target.value as ConnectionStatus | "",
                          }))
                        }
                        required={isSetupMode}
                      >
                        <option value="" disabled>
                          Choose status
                        </option>
                        {connectionStatusOptions.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                        Date of birth
                        <input
                          className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                          type="date"
                          max={adultBirthDateMax}
                          value={profileForm.birthDate}
                          onChange={(event) => setProfileForm((current) => ({ ...current, birthDate: event.target.value }))}
                          required={isSetupMode}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                        Gender
                        <select
                          className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                          value={profileForm.gender}
                          onChange={(event) => setProfileForm((current) => ({ ...current, gender: event.target.value as Gender }))}
                        >
                          <option value="WOMAN">Female</option>
                          <option value="MAN">Male</option>
                          <option value="NON_BINARY">Non-binary</option>
                          <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                        </select>
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      Sexuality
                      <select
                        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        value={profileForm.sexuality}
                        onChange={(event) => setProfileForm((current) => ({ ...current, sexuality: event.target.value as Sexuality | "" }))}
                      >
                        <option value="">Prefer not to say</option>
                        {sexualityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                        State
                        <select
                          className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                          value={profileForm.state}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              state: event.target.value,
                              city: "",
                            }))
                          }
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
                      </label>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                        City
                        <select
                          className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                          value={profileForm.city}
                          onChange={(event) => setProfileForm((current) => ({ ...current, city: event.target.value }))}
                          disabled={!profileForm.state}
                          required={isSetupMode}
                        >
                          <option value="" disabled>
                            {profileForm.state ? "Choose city" : "Choose state first"}
                          </option>
                          {cityOptions.map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                        </select>
                      </label>
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
                          onClick={() => void detectProfileLocation()}
                          disabled={isDetectingLocation || isSavingProfile}
                        >
                          {isDetectingLocation ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
                          {hasGpsLocation ? "Update GPS" : "Use GPS"}
                        </button>
                      </div>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      Interests
                      <input
                        className="h-12 rounded-full border border-black/[0.08] px-4 text-sm font-normal normal-case tracking-normal text-[#0d0d0d] outline-none focus:border-[#18E299] focus:ring-1 focus:ring-[#18E299]"
                        placeholder="e.g. Fashion, Music, Travel"
                        value={profileForm.interests}
                        onChange={(event) => setProfileForm((current) => ({ ...current, interests: event.target.value }))}
                        maxLength={430}
                        required={isSetupMode}
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSavingProfile}
                    >
                      {isSavingProfile ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                      {isSetupMode ? "Complete setup" : "Save"}
                    </button>
                  </div>
                </section>
              </form>
            ) : profileView === "preview" ? (
              <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                <div className="relative aspect-[4/5] min-h-[420px] bg-[#d4fae8]">
                  <button
                    className="absolute left-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-black/[0.08] bg-white/95 text-[#0d0d0d] shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur"
                    type="button"
                    onClick={closeProfileEditor}
                    aria-label="Back to profile"
                    title="Back"
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                  </button>
                  <ProfilePhotoImage
                    photo={profilePhoto}
                    alt={`${user.displayName} profile preview`}
                    variant="full"
                    sizes="(max-width: 768px) 100vw, 430px"
                    iconSize="lg"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white">
                    <div className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                      {profileStatusLabel}
                    </div>
                    <h2 className="mt-3 text-3xl font-semibold">
                      {user.displayName}
                      {profileAge ? `, ${profileAge}` : ""}
                    </h2>
                    <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                      <MapPin className="size-4" aria-hidden="true" />
                      {profileLocation}
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  {profileForm.bio ? (
                    <p className="text-sm leading-6 text-[#444444]">{profileForm.bio}</p>
                  ) : (
                    <p className="text-sm leading-6 text-[#777777]">Add a short bio so people know what kind of city link you are looking for.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewInterests.slice(0, 5).map((interest) => (
                      <span key={interest} className="rounded-full bg-[#fafafa] px-3 py-1 text-xs font-medium text-[#666666]">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ) : (
              <>
                <article className="overflow-hidden rounded-[28px] border border-black/[0.05] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                  <div className="relative aspect-[1.05] min-h-[320px] bg-[#d4fae8]">
                    <ProfilePhotoImage
                      photo={activeProfilePhoto}
                      alt={`${user.displayName} profile`}
                      variant="full"
                      sizes="(max-width: 768px) 100vw, 520px"
                      iconSize="lg"
                    />
                    <div className="absolute left-4 top-4 inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#0d0d0d]">
                      {profileStatusLabel}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 p-3">
                    {Array.from({ length: PROFILE_PHOTO_LIMIT }).map((_, index) => {
                      const photo = visibleProfilePhotos[index];
                      const isActive = index === safeActiveProfilePhotoIndex;

                      return photo ? (
                        <button
                          key={photo.id}
                          className={`relative aspect-square overflow-hidden rounded-[16px] border ${isActive ? "border-[#18E299] ring-2 ring-[#18E299]/30" : "border-black/[0.06]"
                            }`}
                          type="button"
                          onClick={() => setActiveProfilePhotoIndex(index)}
                          aria-label={`Show photo ${index + 1}`}
                        >
                          <ProfilePhotoImage
                            photo={photo}
                            alt={`${user.displayName} thumbnail ${index + 1}`}
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
                          {user.displayName}
                          {profileAge ? `, ${profileAge}` : ""}
                        </h2>
                        <p className="mt-2 flex items-center gap-1 text-sm font-medium text-[#666666]">
                          <MapPin className="size-4" aria-hidden="true" />
                          {profileLocation}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#d4fae8] px-3 py-1 text-xs font-medium text-[#0fa76e]">
                        {visibleProfilePhotos.length} photo{visibleProfilePhotos.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Status</p>
                      <p className="mt-2 text-sm font-medium text-[#444444]">{profileStatusLabel}</p>
                    </div>

                    {formatSexuality(profileForm.sexuality || null) ? (
                      <div className="mt-5">
                        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Sexuality</p>
                        <p className="mt-2 text-sm font-medium text-[#444444]">{formatSexuality(profileForm.sexuality || null)}</p>
                      </div>
                    ) : null}

                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Bio</p>
                      <p className="mt-2 text-sm leading-6 text-[#444444]">
                        {profileForm.bio || "Add a short bio so people know what kind of city link you are looking for."}
                      </p>
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#888888]">Interests</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {previewInterests.length > 0 ? (
                          previewInterests.slice(0, 8).map((interest) => (
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

                <div className="mt-5 grid gap-3">
                  {user.faceVerificationStatus === "VERIFIED" ? (
                    <div className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#d4fae8] px-5 text-sm font-medium text-[#0fa76e]">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      Live Verified
                    </div>
                  ) : (
                    <a
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#18E299]/40 bg-[#d4fae8] px-5 text-sm font-medium text-[#0b7a50]"
                      href="/profile/verify"
                    >
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      Verify Profile
                    </a>
                  )}
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-5 text-sm font-medium text-[#0d0d0d]"
                    type="button"
                    onClick={() => setProfileView("preview")}
                  >
                    <Heart className="size-4" aria-hidden="true" />
                    Preview Card
                  </button>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white"
                    type="button"
                    onClick={() => setProfileView("edit")}
                  >
                    <UserRound className="size-4" aria-hidden="true" />
                    Edit Profile
                  </button>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-5 text-sm font-medium text-[#0d0d0d]"
                    type="button"
                    onClick={() => setIsDeactivateConfirmOpen(true)}
                  >
                    <Power className="size-4" aria-hidden="true" />
                    Deactivate Profile
                  </button>
                  {isDeleteAccountOpen ? (
                    <form onSubmit={deleteAccount} className="grid gap-3 rounded-[20px] border border-red-200 p-4">
                      <label className="grid gap-2 text-sm font-medium">
                        Password
                        <input
                          className="h-12 rounded-full border border-black/[0.08] px-4 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                          type="password"
                          value={deleteAccountPassword}
                          onChange={(event) => setDeleteAccountPassword(event.target.value)}
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
                        {isSubmittingAccountAction ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                        Delete Profile
                      </button>
                    </form>
                  ) : (
                    <button
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 text-sm font-medium text-red-600"
                      type="button"
                      onClick={() => setIsDeleteAccountOpen(true)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete Profile
                    </button>
                  )}
                </div>

                {isDeactivateConfirmOpen ? (
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
                            Your profile will be hidden from discovery and you will be logged out. You can reactivate anytime by logging back in.
                          </p>
                        </div>
                        <button
                          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08]"
                          type="button"
                          onClick={() => setIsDeactivateConfirmOpen(false)}
                          disabled={isSubmittingAccountAction}
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
                          onClick={() => setIsDeactivateConfirmOpen(false)}
                          disabled={isSubmittingAccountAction}
                        >
                          Cancel
                        </button>
                        <button
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0d0d0d] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          onClick={() => {
                            void deactivateAccount().then(() => setIsDeactivateConfirmOpen(false));
                          }}
                          disabled={isSubmittingAccountAction}
                        >
                          {isSubmittingAccountAction ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                          Deactivate
                        </button>
                      </div>
                    </section>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
