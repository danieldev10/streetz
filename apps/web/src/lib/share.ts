export type ShareLinkResult = "shared" | "copied" | "cancelled";

type ShareLinkInput = {
  title: string;
  text: string;
  url: string;
};

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function getAbsoluteAppUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

export async function shareOrCopyLink(input: ShareLinkInput): Promise<ShareLinkResult> {
  const shareData: ShareData = {
    title: input.title,
    text: input.text,
    url: input.url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  await copyToClipboard(input.url);
  return "copied";
}
