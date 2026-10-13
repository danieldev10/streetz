import type { AuthResponse, StreetzUser } from "@/lib/types";
import { ApiError, SessionChangedError } from "./api-error";
import { getBrowserSession } from "./browser-session";
import { timeoutSignal } from "./request-timeout";
export { ApiError } from "./api-error";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? getDefaultSocketUrl(API_URL);

function getDefaultSocketUrl(apiUrl: string) {
  if (/^https?:\/\//.test(apiUrl)) {
    return apiUrl.replace(/\/api\/?$/, "");
  }

  return process.env.NODE_ENV === "development" ? "http://localhost:4000" : "";
}

export function isActiveMember(user: StreetzUser | null) {
  if (!user) {
    return false;
  }

  if (user.role === "ADMIN") {
    return user.accountStatus === "ACTIVE";
  }

  if (user.accountStatus !== "ACTIVE") {
    return false;
  }

  return (
    user.subscriptionStatus === "ACTIVE" &&
    Boolean(user.subscriptionEndsAt) &&
    new Date(user.subscriptionEndsAt as string) > new Date()
  );
}

export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const { response, assertSession } = await requestApiResponse(path, options);
  const data = await readJson(response);
  assertSession();
  return data as T;
}

export async function downloadApiFile(path: string, filename: string, options: RequestInit = {}) {
  const { response, assertSession } = await requestApiResponse(path, options);
  const blob = await response.blob();
  assertSession();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function requestApiResponse(path: string, options: RequestInit) {
  if (path === "/auth/login" || path === "/auth/register") {
    let response: Response | undefined;
    await getBrowserSession().authenticate(async () => {
      response = await fetchApi(path, options);
      const data = await readJson(response.clone());
      if (!response.ok) throw new ApiError(data?.message ?? "Unable to log in.", response.status);
      return data as AuthResponse;
    });
    const session = getBrowserSession();
    const revision = session.version;
    return { response: response!, assertSession: () => session.assertRevision(revision) };
  }
  const hasAuthHeader = hasAuthorizationHeader(options.headers);
  const session = typeof window !== "undefined" ? getBrowserSession() : undefined;
  const revision = session?.version;
  if (hasAuthHeader && session && !session.current) throw new ApiError("Please log in again.", 401);
  // Do not let an old component perform an action using a newly logged-in account.
  if (hasAuthHeader && session?.current) {
    const supplied = toPlainHeaders(options.headers);
    const authorization = Object.entries(supplied).find(([key]) => key.toLowerCase() === "authorization")?.[1];
    try {
      const payload = JSON.parse(atob((authorization ?? "").replace(/^Bearer /, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string };
      if (payload.sub !== session.current.user.id) throw new Error();
    } catch { throw new SessionChangedError(); }
  }
  let response = await fetchApi(path, options);
  if (hasAuthHeader && revision) session?.assertRevision(revision);

  if (!response.ok && response.status === 401 && hasAuthHeader && typeof window !== "undefined" && path !== "/auth/refresh") {
    const original = Object.entries(toPlainHeaders(options.headers)).find(([key]) => key.toLowerCase() === "authorization")?.[1];
    const refreshedAuth = session?.current && original !== `Bearer ${session.current.accessToken}`
      ? session.current : await refreshAccessToken();
    if (revision) session?.assertRevision(revision);
    response = await fetchApi(path, withAccessToken(options, refreshedAuth.accessToken));
  }
  if (hasAuthHeader && revision) session?.assertRevision(revision);

  if (!response.ok) {
    const data = await readJson(response);
    if (response.status === 401 && hasAuthHeader && revision) session?.expire(revision);

    throw new ApiError(data?.message ?? "Request failed.", response.status);
  }

  return { response, assertSession: () => { if (hasAuthHeader && revision) session?.assertRevision(revision); } };
}

export async function refreshAccessToken() {
  return getBrowserSession().refresh(async () => {
    const response = await fetchApi("/auth/refresh", { method: "POST" });
    const data = await readJson(response);
    if (!response.ok) throw new ApiError(data?.message ?? "Unable to refresh your session.", response.status);
    return data as AuthResponse;
  });
}

export async function revokeRefreshSession() {
  await getBrowserSession().logout(async () => {
    const response = await fetchApi("/auth/logout", { method: "POST" });
    if (!response.ok) throw new ApiError("Unable to revoke your session. Please retry when online.", response.status);
  });
}

export function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function hasAuthorizationHeader(headers: HeadersInit | undefined) {
  if (!headers) {
    return false;
  }

  if (headers instanceof Headers) {
    return headers.has("authorization");
  }

  if (Array.isArray(headers)) {
    return headers.some(([key]) => key.toLowerCase() === "authorization");
  }

  return Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
}

function fetchApi(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: options.credentials ?? "include",
    signal: options.signal ?? timeoutSignal(15_000),
    headers: {
      "Content-Type": "application/json",
      "X-Crushclub-Client": "web",
      ...toPlainHeaders(options.headers),
    },
  });
}

function withAccessToken(options: RequestInit, accessToken: string): RequestInit {
  const headers = toPlainHeaders(options.headers);
  const withoutAuthorization = Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== "authorization"));
  return {
    ...options,
    headers: {
      ...withoutAuthorization,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

function readJson(response: Response) {
  return response.json().catch((error: unknown) => {
    if (error instanceof SyntaxError) return null;
    // An interrupted body is a network failure, not an empty success response.
    throw error;
  });
}

function toPlainHeaders(headers: HeadersInit | undefined) {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}

const USER_FRIENDLY_ERROR = "We ran into a problem. Please try again.";

export function getUserErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message || USER_FRIENDLY_ERROR;
  }

  if (process.env.NODE_ENV === "development") {
    const diagnostic =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        : error;

    console.warn("crushclub unexpected client error", diagnostic);
  }

  return USER_FRIENDLY_ERROR;
}
