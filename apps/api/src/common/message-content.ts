import { BadRequestException } from "@nestjs/common";

const MESSAGE_MAX_LENGTH = 1000;
const GIF_URL_MAX_LENGTH = 500;

export function normalizeMessageContent(rawBody?: string, rawGifUrl?: string) {
  const body = rawBody?.trim() ?? "";
  const gifUrl = normalizeGiphyUrl(rawGifUrl);

  if (!body && !gifUrl) {
    throw new BadRequestException("Message cannot be empty.");
  }

  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new BadRequestException(`Messages must be ${MESSAGE_MAX_LENGTH} characters or fewer.`);
  }

  return { body, gifUrl };
}

function normalizeGiphyUrl(rawGifUrl?: string) {
  const value = rawGifUrl?.trim();
  if (!value) return null;
  if (value.length > GIF_URL_MAX_LENGTH) throw new BadRequestException("GIF URL is too long.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("Invalid GIF URL.");
  }

  if (url.protocol !== "https:" || !/^media\d*\.giphy\.com$/i.test(url.hostname)) {
    throw new BadRequestException("Only GIPHY GIFs are supported.");
  }

  return url.toString();
}
