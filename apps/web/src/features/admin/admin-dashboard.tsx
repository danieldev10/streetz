"use client";

import { ScreenHeader } from "@/components/app/navigation";

export function AdminDashboard() {
  return (
    <section>
      <ScreenHeader eyebrow="Admin" title="Admin." />
      <div className="px-5 pb-24 md:px-8 md:pb-8" />
    </section>
  );
}
