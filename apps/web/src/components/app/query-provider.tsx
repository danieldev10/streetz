"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistPublicQueries, restorePublicQueries } from "@/lib/public-query-persistence";

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

  useEffect(() => {
    restorePublicQueries(queryClient);
    persistPublicQueries(queryClient);
    let timer: number | null = null;
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => persistPublicQueries(queryClient), 250);
    });
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      persistPublicQueries(queryClient);
      unsubscribe();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
