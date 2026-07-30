import type { Metadata } from "next";
import { SupportRequestsPage } from "@/features/support/support-requests-page";

export const metadata: Metadata = {
  title: "Support requests | Crushclub",
  description: "View and continue your private Crushclub support requests.",
};

export default function RequestsPage() {
  return <SupportRequestsPage />;
}
