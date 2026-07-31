"use client";

import type { ReactNode } from "react";
import { PublicRoute } from "@/components/app/public-route";

export function SupportShell({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  maxWidth?: "max-w-3xl" | "max-w-4xl" | "max-w-6xl";
}) {
  return (
    <PublicRoute activeTab="profile">
      {() => (
        <div className="min-h-[calc(100vh-80px)] bg-[#f7f7f7] text-[#0d0d0d] md:min-h-screen">
          <div className={`mx-auto w-full ${maxWidth} px-5 py-8 md:px-8 md:py-12`}>
            {children}
          </div>
        </div>
      )}
    </PublicRoute>
  );
}
