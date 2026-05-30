import type { AuthResponse, StreetzUser } from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? getDefaultSocketUrl(API_URL);
export const TOKEN_KEY = "streetz_access_token";
export const LEGACY_TOKEN_KEYS = ["access_token"];
export const UNAUTHORIZED_EVENT = "streetz:auth:unauthorized";
export const AUTH_REFRESHED_EVENT = "streetz:auth:refreshed";

let pendingAccessTokenRefresh: Promise<AuthResponse> | null = null;

function getDefaultSocketUrl(apiUrl: string) {
  if (/^https?:\/\//.test(apiUrl)) {
    return apiUrl.replace(/\/api\/?$/, "");
  }

  return process.env.NODE_ENV === "development" ? "http://localhost:4000" : "";
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
  const hasAuthHeader = hasAuthorizationHeader(options.headers);
  let response = await fetchApi(path, options);

  if (!response.ok && response.status === 401 && hasAuthHeader && typeof window !== "undefined" && path !== "/auth/refresh") {
    const refreshedAuth = await refreshAccessToken().catch(() => null);

    if (refreshedAuth) {
      response = await fetchApi(path, withAccessToken(options, refreshedAuth.accessToken));
    }
  }

  const data = await readJson(response);

  if (!response.ok) {
    if (response.status === 401 && hasAuthHeader && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    throw new ApiError(data?.message ?? "Request failed.", response.status);
  }

  return data as T;
}

export async function refreshAccessToken() {
  if (typeof window === "undefined") {
    throw new ApiError("Cannot refresh session outside the browser.", 401);
  }

  if (!pendingAccessTokenRefresh) {
    pendingAccessTokenRefresh = fetchApi("/auth/refresh", { method: "POST" })
      .then(async (response) => {
        const data = await readJson(response);

        if (!response.ok) {
          throw new ApiError(data?.message ?? "Session expired. Please log in again.", response.status);
        }

        const auth = data as AuthResponse;
        window.localStorage.setItem(TOKEN_KEY, auth.accessToken);
        clearLegacyAccessTokens();
        window.dispatchEvent(new CustomEvent<AuthResponse>(AUTH_REFRESHED_EVENT, { detail: auth }));

        return auth;
      })
      .finally(() => {
        pendingAccessTokenRefresh = null;
      });
  }

  return pendingAccessTokenRefresh;
}

export async function revokeRefreshSession() {
  await fetchApi("/auth/logout", { method: "POST" }).catch(() => null);
}

export function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function clearLegacyAccessTokens() {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of LEGACY_TOKEN_KEYS) {
    window.localStorage.removeItem(key);
  }
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
    headers: {
      "Content-Type": "application/json",
      ...toPlainHeaders(options.headers),
    },
  });
}

function withAccessToken(options: RequestInit, accessToken: string): RequestInit {
  return {
    ...options,
    headers: {
      ...toPlainHeaders(options.headers),
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

function readJson(response: Response) {
  return response.json().catch(() => null);
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
