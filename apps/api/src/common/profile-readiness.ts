export type ProfileSetupSource = {
  bio?: string | null;
  birthDate?: Date | string | null;
  connectionStatus?: unknown | null;
  city?: string | null;
  state?: string | null;
  interests?: string[] | null;
};

export function isProfileSetupComplete({
  profile,
  photos
}: {
  profile?: ProfileSetupSource | null;
  photos?: Array<unknown> | null;
}) {
  return (
    Boolean(profile?.bio?.trim()) &&
    Boolean(profile?.birthDate) &&
    Boolean(profile?.connectionStatus) &&
    Boolean(profile?.city?.trim()) &&
    Boolean(profile?.state?.trim()) &&
    Boolean(profile?.interests?.length) &&
    Boolean(photos?.length)
  );
}
