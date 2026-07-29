/**
 * Compatibility barrel for existing imports.
 *
 * New code may import from a focused module under `@/lib/types/*`; existing
 * callers can continue using `@/lib/types` while domains migrate incrementally.
 */
export * from "./types/account";
export * from "./types/admin";
export * from "./types/chat";
export * from "./types/discovery";
export * from "./types/events";
export * from "./types/navigation";
export * from "./types/notifications";
export * from "./types/payments";
export * from "./types/profile";
