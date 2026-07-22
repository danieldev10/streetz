import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your event tickets | crushclub",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default function GuestTicketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
