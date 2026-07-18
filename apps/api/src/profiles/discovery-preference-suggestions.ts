import { DiscoveryGender, Gender, Sexuality } from "@prisma/client";

export function toDiscoveryGender(gender: Gender | null | undefined): DiscoveryGender | null {
  if (gender === Gender.WOMAN) return DiscoveryGender.WOMAN;
  if (gender === Gender.MAN) return DiscoveryGender.MAN;
  if (gender === Gender.NON_BINARY) return DiscoveryGender.NON_BINARY;
  return null;
}

export function suggestInterestedInGenders(
  gender: Gender | null | undefined,
  sexuality: Sexuality | null | undefined
): DiscoveryGender[] {
  if (sexuality === Sexuality.STRAIGHT && gender === Gender.MAN) return [DiscoveryGender.WOMAN];
  if (sexuality === Sexuality.STRAIGHT && gender === Gender.WOMAN) return [DiscoveryGender.MAN];
  if (sexuality === Sexuality.GAY && gender === Gender.MAN) return [DiscoveryGender.MAN];
  if (sexuality === Sexuality.LESBIAN && gender === Gender.WOMAN) return [DiscoveryGender.WOMAN];
  if (sexuality === Sexuality.BISEXUAL || sexuality === Sexuality.PANSEXUAL) {
    return [DiscoveryGender.WOMAN, DiscoveryGender.MAN, DiscoveryGender.NON_BINARY];
  }

  return [];
}
