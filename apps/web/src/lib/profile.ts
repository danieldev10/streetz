import type { ConnectionStatus, Sexuality, StreetzProfile } from "@/lib/types";

export const PROFILE_PHOTO_LIMIT = 4;
export const MINIMUM_PROFILE_AGE = 18;

export const connectionStatusOptions: Array<{ value: ConnectionStatus; label: string }> = [
  { value: "MEET_NOW", label: "Meet Now" },
  { value: "FWB", label: "FWB" },
  { value: "JUST_FRIENDS", label: "Just Friends" },
  { value: "DATING", label: "Dating" },
  { value: "SERIOUS_RELATIONSHIP", label: "Serious Relationship" },
  { value: "CASUAL_DATING", label: "Casual Dating" },
  { value: "FRIENDS_FIRST", label: "Friends First" },
  { value: "OPEN_TO_ANYTHING", label: "Open to Anything" },
  { value: "EVENT_BUDDY", label: "Event Buddy" },
  { value: "CHAT_FIRST", label: "Chat First" },
  { value: "SEX", label: "Sex" },
];

export const connectionStatusLabels: Record<ConnectionStatus, string> = {
  MEET_NOW: "Meet Now",
  FWB: "FWB",
  JUST_FRIENDS: "Just Friends",
  DATING: "Dating",
  SERIOUS_RELATIONSHIP: "Serious Relationship",
  CASUAL_DATING: "Casual Dating",
  FRIENDS_FIRST: "Friends First",
  OPEN_TO_ANYTHING: "Open to Anything",
  EVENT_BUDDY: "Event Buddy",
  CHAT_FIRST: "Chat First",
  SEX: "Sex",
};

export const sexualityOptions: Array<{ value: Sexuality; label: string }> = [
  { value: "STRAIGHT", label: "Straight" },
  { value: "GAY", label: "Gay" },
  { value: "LESBIAN", label: "Lesbian" },
  { value: "BISEXUAL", label: "Bisexual" },
  { value: "PANSEXUAL", label: "Pansexual" },
  { value: "ASEXUAL", label: "Asexual" },
  { value: "QUEER", label: "Queer" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

export const sexualityLabels: Record<Sexuality, string> = {
  STRAIGHT: "Straight",
  GAY: "Gay",
  LESBIAN: "Lesbian",
  BISEXUAL: "Bisexual",
  PANSEXUAL: "Pansexual",
  ASEXUAL: "Asexual",
  QUEER: "Queer",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export function formatSexuality(sexuality: Sexuality | null | undefined) {
  return sexuality ? sexualityLabels[sexuality] : null;
}

export function getAgeFromBirthDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const birthDate = parseDateInputValue(value);

  if (!birthDate) {
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

function parseDateInputValue(value: string) {
  const [yearValue, monthValue, dayValue] = value.split("-").map(Number);

  if (!yearValue || !monthValue || !dayValue) {
    return null;
  }

  const date = new Date(yearValue, monthValue - 1, dayValue);

  if (date.getFullYear() !== yearValue || date.getMonth() !== monthValue - 1 || date.getDate() !== dayValue) {
    return null;
  }

  return date;
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getAdultBirthDateMaxValue(referenceDate = new Date()) {
  const cutoff = new Date(referenceDate);
  cutoff.setFullYear(cutoff.getFullYear() - MINIMUM_PROFILE_AGE);

  return formatDateInputValue(cutoff);
}

export function getBirthDateValidationMessage(value: string, options: { required?: boolean } = {}) {
  if (!value) {
    return options.required ? "Add your birth date." : null;
  }

  const birthDate = parseDateInputValue(value);

  if (!birthDate || birthDate > new Date()) {
    return "Enter a valid birth date.";
  }

  const age = getAgeFromBirthDate(value);

  if (age === null || age < MINIMUM_PROFILE_AGE) {
    return `crushclub discovery is only available to users who are at least ${MINIMUM_PROFILE_AGE}.`;
  }

  return null;
}

export function formatConnectionStatus(status: ConnectionStatus | null | undefined) {
  return status ? connectionStatusLabels[status] : "crushclub member";
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

  const birthDateMessage = getBirthDateValidationMessage(form.birthDate, { required: true });

  if (birthDateMessage) {
    issues.push(birthDateMessage.replace(/\.$/, "").toLowerCase());
  }

  if (!form.connectionStatus) {
    issues.push("choose what you are looking for");
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
