import type { Metadata } from "next";
import { SupportGeneralPage } from "@/features/support/support-general-page";

export const metadata: Metadata = {
  title: "Support | Crushclub",
  description: "Find answers and contact the Crushclub support team."
};

export default function SupportPage() {
  return <SupportGeneralPage />;
}
