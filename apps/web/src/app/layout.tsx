import type { Metadata } from "next";
import { SessionProvider } from "@/components/app/session-provider";
import "./globals.css";

function getOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const resourceHintOrigins = Array.from(
  new Set(
    [
      getOrigin(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"),
      getOrigin(process.env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN),
      getOrigin(process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL),
      getOrigin(process.env.NEXT_PUBLIC_CLOUDFRONT_BASE_URL)
    ].filter((origin): origin is string => Boolean(origin))
  )
);

export const metadata: Metadata = {
  title: "crushclub",
  description: "Social discovery, public chat rooms, and event ticketing for Nigerian communities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {resourceHintOrigins.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} crossOrigin="" />
        ))}
      </head>
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
