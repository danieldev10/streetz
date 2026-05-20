import type { StreetzUser } from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL.replace(/\/api\/?$/, "");
export const TOKEN_KEY = "streetz_access_token";
export const UNAUTHORIZED_EVENT = "streetz:auth:unauthorized";

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
    return true;
  }

  return (
    user.subscriptionStatus === "ACTIVE" &&
    Boolean(user.subscriptionEndsAt) &&
    new Date(user.subscriptionEndsAt as string) > new Date()
  );
}

export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const hasAuthHeader = hasAuthorizationHeader(options.headers);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && hasAuthHeader && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    throw new ApiError(data?.message ?? "Request failed.", response.status);
  }

  return data as T;
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

const USER_FRIENDLY_ERROR = "We ran into a problem. Please try again.";

export function getUserErrorMessage(error: unknown): string {
  if (process.env.NODE_ENV === "development") {
    console.error("[streetz]", error);
  }

  return USER_FRIENDLY_ERROR;
}
