"use client";

import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ScreenHeader } from "@/components/app/navigation";
import { LoadingState } from "@/components/loading-state";
import { useSession } from "@/components/app/session-provider";
import { DiscoveryPreferencesForm } from "@/features/discovery/discovery-preferences-form";
import { apiRequest, authHeaders, getUserErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth-constraints";
import { PROFILE_PHOTO_UPLOAD_MAX_BYTES, prepareImageForUpload } from "@/lib/image-upload";
import { getCurrentBrowserCoordinates, getLocationPermissionMessage, type ReverseGeocodeSuggestion } from "@/lib/location";
import { getCitiesForState, nigeriaStateNames, normalizeLocationSuggestion } from "@/lib/nigeria-locations";
import {
  PROFILE_PHOTO_LIMIT,
  PROFILE_INTEREST_LIMIT,
  formatConnectionStatus,
  formatProfileSetupIssues,
  getAdultBirthDateMaxValue,
  getAgeFromBirthDate,
  getBirthDateValidationMessage,
  getProfileSetupIssues,
  getProfileSetupIssuesFromForm,
  isProfileReadyForDiscovery,
  profileInterestSuggestions,
} from "@/lib/profile";
import type { ProfilePhoto, ProfileTabMode, StreetzProfile, StreetzUser } from "@/lib/types";
import { ProfileEditorView } from "./profile-editor-view";
import {
  SUPPORTED_PROFILE_PHOTO_TYPES,
  createProfileForm,
  getInterestKey,
  normalizeInterestValue,
  parseInterestText,
  serializeInterests,
} from "./profile-model";
import { ProfileOverviewView } from "./profile-overview-view";
import { ProfilePreviewView } from "./profile-preview-view";

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
  const queryClient = useQueryClient();
  const isSetupMode = mode === "setup";
  const [profile, setProfile] = useState<StreetzProfile | null>(
    () => queryClient.getQueryData<StreetzProfile | null>(queryKeys.profile(user.id)) ?? null
  );
  const [profileView, setProfileView] = useState<"overview" | "edit" | "preview">(
    isSetupMode ? "edit" : "overview"
  );
  const [activeProfilePhotoIndex, setActiveProfilePhotoIndex] = useState(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(profile === null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [uploadingPhotoSlot, setUploadingPhotoSlot] = useState<number | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmittingAccountAction, setIsSubmittingAccountAction] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [isDiscoveryPreferenceOpen, setIsDiscoveryPreferenceOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [interestQuery, setInterestQuery] = useState("");
  const [profileForm, setProfileForm] = useState(() => createProfileForm(profile, user));

  const profilePhotos = profile?.user.photos ?? [];
  const visibleProfilePhotos = profilePhotos.slice(0, PROFILE_PHOTO_LIMIT);
  const profilePhoto = visibleProfilePhotos[0];
  const safeActiveProfilePhotoIndex =
    activeProfilePhotoIndex < visibleProfilePhotos.length ? activeProfilePhotoIndex : 0;
  const activeProfilePhoto = visibleProfilePhotos[safeActiveProfilePhotoIndex] ?? profilePhoto;
  const attendedEventCount = profile?.attendedEventCount ?? 0;
  const isUploadingPhoto = uploadingPhotoSlot !== null;
  const canDeleteProfilePhoto = visibleProfilePhotos.length > 1;
  const nextAvailablePhotoSlot = Math.min(visibleProfilePhotos.length, PROFILE_PHOTO_LIMIT - 1);
  const profileAge = getAgeFromBirthDate(profileForm.birthDate);
  const adultBirthDateMax = getAdultBirthDateMaxValue();
  const profileLocation = [profileForm.city, profileForm.state].filter(Boolean).join(", ") || "Nigeria";
  const profileDisplayName = profileForm.displayName.trim() || user.displayName;
  const hasGpsLocation = profileForm.latitude !== null && profileForm.longitude !== null;
  const profileStatusLabel = profileForm.connectionStatus ? formatConnectionStatus(profileForm.connectionStatus) : "Looking for?";
  const stateOptions = profileForm.state && !nigeriaStateNames.includes(profileForm.state)
    ? [...nigeriaStateNames, profileForm.state]
    : nigeriaStateNames;
  const knownCityOptions = getCitiesForState(profileForm.state);
  const cityOptions = profileForm.city && !knownCityOptions.includes(profileForm.city)
    ? [...knownCityOptions, profileForm.city]
    : knownCityOptions;
  const previewInterests = parseInterestText(profileForm.interests);
  const selectedInterestKeys = new Set(previewInterests.map(getInterestKey));
  const normalizedInterestQuery = getInterestKey(interestQuery);
  const suggestedInterests = profileInterestSuggestions
    .filter((interest) => !selectedInterestKeys.has(getInterestKey(interest)))
    .filter((interest) => !normalizedInterestQuery || getInterestKey(interest).includes(normalizedInterestQuery))
    .slice(0, 18);
  const canAddMoreInterests = previewInterests.length < PROFILE_INTEREST_LIMIT;

  function syncProfileForm(profileResponse: StreetzProfile) {
    setProfileForm(createProfileForm(profileResponse, user));
  }

  async function loadProfile(
    options: { clearNotice?: boolean; showLoading?: boolean; syncForm?: boolean; force?: boolean } = {},
  ) {
    const { clearNotice = true, showLoading = true, syncForm = true, force = false } = options;

    if (showLoading) {
      setIsLoadingProfile(true);
    }

    if (clearNotice) {
      setNotice(null);
    }

    try {
      if (force) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.profile(user.id), exact: true });
      }

      const profileResponse = await queryClient.fetchQuery({
        queryKey: queryKeys.profile(user.id),
        queryFn: () => apiRequest<StreetzProfile | null>("/profiles/me", {
          headers: authHeaders(token)
        }),
        staleTime: 5 * 60_000
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
  }, [token, user.id]);

  useEffect(() => {
    if (!setupNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setNotice(setupNotice);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [setupNotice]);

  function setInterests(interests: string[]) {
    setProfileForm((current) => ({
      ...current,
      interests: serializeInterests(interests),
    }));
  }

  function addInterest(interest: string) {
    const normalized = normalizeInterestValue(interest);

    if (!normalized || selectedInterestKeys.has(getInterestKey(normalized))) {
      return;
    }

    if (!canAddMoreInterests) {
      setNotice(`You can add up to ${PROFILE_INTEREST_LIMIT} interests.`);
      return;
    }

    setInterests([...previewInterests, normalized]);
    setInterestQuery("");
  }

  function removeInterest(interest: string) {
    const key = getInterestKey(interest);
    setInterests(previewInterests.filter((currentInterest) => getInterestKey(currentInterest) !== key));
  }

  function handleInterestSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    const [firstSuggestion] = suggestedInterests;

    if (firstSuggestion) {
      addInterest(firstSuggestion);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const birthDateMessage = getBirthDateValidationMessage(profileForm.birthDate, { required: isSetupMode });

    if (birthDateMessage) {
      setNotice(birthDateMessage);
      return;
    }

    const interests = parseInterestText(profileForm.interests);
    const displayName = profileForm.displayName.trim();

    if (displayName.length < 2) {
      setNotice("Username must be at least 2 characters.");
      return;
    }

    if (displayName.length > 80) {
      setNotice("Username must be 80 characters or fewer.");
      return;
    }

    if (profileForm.bio.length > 500) {
      setNotice("Bio must be 500 characters or fewer.");
      return;
    }

    if (profileForm.city.length > 80 || profileForm.state.length > 80) {
      setNotice("City and state must be 80 characters or fewer.");
      return;
    }

    if (interests.length > PROFILE_INTEREST_LIMIT) {
      setNotice(`You can add up to ${PROFILE_INTEREST_LIMIT} interests.`);
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
          displayName,
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
      queryClient.setQueryData(queryKeys.profile(user.id), savedProfile);
      syncProfileForm(savedProfile);
      updateSessionUser((currentUser) => ({
        ...currentUser,
        displayName: savedProfile.user.displayName,
      }));

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
      void loadProfile({ clearNotice: false, showLoading: false, force: true });
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
      await loadProfile({ clearNotice: false, showLoading: false, syncForm: false, force: true });
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
      await loadProfile({ clearNotice: false, showLoading: false, syncForm: false, force: true });
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
            <div className="hidden items-center rounded-full bg-[#f6e0f6] px-4 py-2 text-sm font-medium text-[#9d2a9e] md:inline-flex">
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
        {notice ? <p className="mb-4 rounded-[16px] bg-[#f6e0f6] p-3 text-sm font-medium text-[#7c1f7d]">{notice}</p> : null}

        {isLoadingProfile ? (
          <LoadingState label="Loading profile" className="min-h-[420px] rounded-[28px] border border-black/[0.05]" />
        ) : (
          <div className={profileView === "edit" ? "mx-auto max-w-2xl" : "mx-auto max-w-[520px]"}>
            {profileView === "edit" ? (
              <ProfileEditorView
                adultBirthDateMax={adultBirthDateMax}
                canAddMoreInterests={canAddMoreInterests}
                canDeletePhoto={canDeleteProfilePhoto}
                cityOptions={cityOptions}
                displayName={profileDisplayName}
                form={profileForm}
                hasGpsLocation={hasGpsLocation}
                interestQuery={interestQuery}
                isDetectingLocation={isDetectingLocation}
                isSaving={isSavingProfile}
                isSetupMode={isSetupMode}
                nextAvailablePhotoSlot={nextAvailablePhotoSlot}
                photos={visibleProfilePhotos}
                profilePhoto={profilePhoto}
                selectedInterests={previewInterests}
                stateOptions={stateOptions}
                suggestedInterests={suggestedInterests}
                uploadingPhotoSlot={uploadingPhotoSlot}
                onAddInterest={addInterest}
                onChangeForm={(patch) =>
                  setProfileForm((current) => ({ ...current, ...patch }))
                }
                onChangeInterestQuery={setInterestQuery}
                onDeletePhoto={(photo, index) => void deleteProfilePhoto(photo, index)}
                onDetectLocation={() => void detectProfileLocation()}
                onInterestKeyDown={handleInterestSearchKeyDown}
                onRemoveInterest={removeInterest}
                onSubmit={saveProfile}
                onUploadPhoto={uploadProfilePhoto}
              />
            ) : profileView === "preview" ? (
              <ProfilePreviewView
                attendedEventCount={attendedEventCount}
                bio={profileForm.bio}
                displayName={profileDisplayName}
                interests={previewInterests}
                location={profileLocation}
                photo={profilePhoto}
                profileAge={profileAge}
                statusLabel={profileStatusLabel}
                onBack={closeProfileEditor}
              />
            ) : (
              <>
                <ProfileOverviewView
                  activePhoto={activeProfilePhoto}
                  activePhotoIndex={safeActiveProfilePhotoIndex}
                  attendedEventCount={attendedEventCount}
                  bio={profileForm.bio}
                  deleteAccountPassword={deleteAccountPassword}
                  displayName={profileDisplayName}
                  interests={previewInterests}
                  isDeactivateConfirmOpen={isDeactivateConfirmOpen}
                  isDeleteAccountOpen={isDeleteAccountOpen}
                  isFaceVerified={user.faceVerificationStatus === "VERIFIED"}
                  isSubmittingAccountAction={isSubmittingAccountAction}
                  location={profileLocation}
                  photos={visibleProfilePhotos}
                  profileAge={profileAge}
                  sexuality={profileForm.sexuality}
                  statusLabel={profileStatusLabel}
                  onChangeActivePhoto={setActiveProfilePhotoIndex}
                  onChangeDeletePassword={setDeleteAccountPassword}
                  onCloseDeactivate={() => setIsDeactivateConfirmOpen(false)}
                  onDeactivate={() => {
                    void deactivateAccount().then(() => setIsDeactivateConfirmOpen(false));
                  }}
                  onDeleteAccount={deleteAccount}
                  onEdit={() => setProfileView("edit")}
                  onOpenDeactivate={() => setIsDeactivateConfirmOpen(true)}
                  onOpenDeleteAccount={() => setIsDeleteAccountOpen(true)}
                  onOpenDiscoveryPreferences={() => setIsDiscoveryPreferenceOpen(true)}
                  onPreview={() => setProfileView("preview")}
                />

                {isDiscoveryPreferenceOpen ? (
                  <DiscoveryPreferencesForm
                    token={token}
                    onClose={() => setIsDiscoveryPreferenceOpen(false)}
                    onSaved={() => {
                      setIsDiscoveryPreferenceOpen(false);
                      setNotice("Discovery preferences saved.");
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
