import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streetz Prototype",
  description: "Social discovery, public chat rooms, and event ticketing for Nigerian communities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
