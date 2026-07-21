import "server-only";

function getServerApiUrl() {
  const configuredUrl =
    process.env.API_SERVER_URL?.trim() ||
    process.env.API_PROXY_TARGET?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!configuredUrl || !/^https?:\/\//i.test(configuredUrl)) {
    return null;
  }

  const baseUrl = configuredUrl.replace(/\/+$/, "");
  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

export async function publicApiRequest<T>(path: string, revalidate = 300): Promise<T | null> {
  const apiUrl = getServerApiUrl();

  if (!apiUrl) {
    return null;
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json() as T;
  } catch {
    return null;
  }
}
