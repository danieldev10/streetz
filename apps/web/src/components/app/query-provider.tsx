"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 15 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false
      },
      mutations: { retry: 0 }
    }
  }));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
