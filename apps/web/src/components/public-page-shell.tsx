"use client";

import type { ReactNode } from "react";
import { PublicRoute } from "@/components/app/public-route";

export function PublicPageShell({ children }: { children: ReactNode }) {
  return <PublicRoute activeTab="events">{() => children}</PublicRoute>;
}
