import type { ConnectionStatus, StreetzProfile } from "@/lib/types";

export const PROFILE_PHOTO_LIMIT = 4;

export const connectionStatusOptions: Array<{ value: ConnectionStatus; label: string }> = [
  { value: "MEET_NOW", label: "Meet Now" },
  { value: "FWB", label: "FWB" },
  { value: "JUST_FRIENDS", label: "Just Friends" },
  { value: "DATING", label: "Dating" },
];

export const connectionStatusLabels: Record<ConnectionStatus, string> = {
  MEET_NOW: "Meet Now",
  FWB: "FWB",
  JUST_FRIENDS: "Just Friends",
  DATING: "Dating",
};

export function getAgeFromBirthDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const birthDate = new Date(value);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayHasPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!birthdayHasPassed) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function formatConnectionStatus(status: ConnectionStatus | null | undefined) {
  return status ? connectionStatusLabels[status] : "Streetz member";
}



export function getProfileSetupIssuesFromForm(
  form: {
    bio: string;
    birthDate: string;
    connectionStatus: ConnectionStatus | "";
    city: string;
    state: string;
    interests: string;
  },
  photoCount: number
) {
  const interests = form.interests
    .split(",")
    .map((interest) => interest.trim())
    .filter(Boolean);
  const issues: string[] = [];

  if (photoCount < 1) {
    issues.push("add at least one profile photo");
  }

  if (!form.bio.trim()) {
    issues.push("write a bio");
  }

  if (!form.birthDate) {
    issues.push("add your birth date");
  }

  if (!form.connectionStatus) {
    issues.push("choose your status");
  }

  if (!form.city.trim()) {
    issues.push("add your city");
  }

  if (!form.state.trim()) {
    issues.push("add your state");
  }

  if (interests.length < 1) {
    issues.push("add at least one interest");
  }

  return issues;
}

export function getProfileSetupIssues(profile: StreetzProfile | null | undefined) {
  if (!profile) {
    return ["set up your profile"];
  }

  return getProfileSetupIssuesFromForm(
    {
      bio: profile.bio ?? "",
      birthDate: profile.birthDate ? profile.birthDate.slice(0, 10) : "",
      connectionStatus: profile.connectionStatus ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      interests: profile.interests.join(", "),
    },
    profile.user.photos.length
  );
}

export function isProfileReadyForDiscovery(profile: StreetzProfile | null | undefined) {
  return getProfileSetupIssues(profile).length === 0;
}

export function formatProfileSetupIssues(issues: string[]) {
  if (issues.length === 0) {
    return "";
  }

  if (issues.length === 1) {
    return issues[0];
  }

  if (issues.length === 2) {
    return `${issues[0]} and ${issues[1]}`;
  }

  return `${issues.slice(0, -1).join(", ")}, and ${issues.at(-1)}`;
}
