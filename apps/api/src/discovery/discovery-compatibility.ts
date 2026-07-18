import { DiscoveryGender } from "@prisma/client";
import { calculateAge } from "../common/age";

export type CompatibilityProfile = {
  birthDate: Date;
  discoveryGender: DiscoveryGender;
  interestedInGenders: DiscoveryGender[];
  minAge: number;
  maxAge: number;
};

export function areDiscoveryProfilesCompatible(
  viewer: CompatibilityProfile,
  candidate: CompatibilityProfile,
  now = new Date()
) {
  const viewerAge = calculateAge(viewer.birthDate, now);
  const candidateAge = calculateAge(candidate.birthDate, now);

  return (
    viewer.interestedInGenders.includes(candidate.discoveryGender) &&
    candidate.interestedInGenders.includes(viewer.discoveryGender) &&
    candidateAge >= viewer.minAge &&
    candidateAge <= viewer.maxAge &&
    viewerAge >= candidate.minAge &&
    viewerAge <= candidate.maxAge
  );
}
