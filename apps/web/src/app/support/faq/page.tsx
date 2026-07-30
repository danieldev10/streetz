import type { Metadata } from "next";
import { SupportFaqPage } from "@/features/support/support-faq-page";

export const metadata: Metadata = {
  title: "Support FAQ | Crushclub",
  description: "Answers to common Crushclub account, event, ticket, and safety questions.",
};

export default function SupportFaqRoute() {
  return <SupportFaqPage />;
}
