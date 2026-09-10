import { Suspense } from "react";
import { LoadingState } from "@/components/loading-state";
import { ResetPasswordClient } from "./reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-surface px-5 text-ink">
          <LoadingState label="Loading" />
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
