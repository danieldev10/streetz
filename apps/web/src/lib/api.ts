import type { StreetzUser } from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL.replace(/\/api\/?$/, "");
export const TOKEN_KEY = "streetz_access_token";

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
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message ?? "Request failed.");
  }

  return data as T;
}

export function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
