"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-white px-6 text-[#0d0d0d]">
        <main className="max-w-md text-center">
          <h1 className="text-3xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-[#666666]">The error has been recorded. Please try loading this screen again.</p>
          <button
            type="button"
            className="mt-6 h-12 rounded-full bg-[#0d0d0d] px-6 text-sm font-semibold text-white"
            onClick={() => unstable_retry()}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
