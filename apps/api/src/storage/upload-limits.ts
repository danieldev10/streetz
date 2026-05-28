const MEGABYTE_BYTES = 1024 * 1024;

export const PROFILE_PHOTO_UPLOAD_MAX_BYTES = 3 * MEGABYTE_BYTES;
export const EVENT_IMAGE_UPLOAD_MAX_BYTES = 5 * MEGABYTE_BYTES;

export function formatUploadLimit(bytes: number) {
  if (bytes >= MEGABYTE_BYTES) {
    return `${Math.round(bytes / MEGABYTE_BYTES)}MB`;
  }

  return `${Math.round(bytes / 1024)}KB`;
}
