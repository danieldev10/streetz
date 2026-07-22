import type { QueryClient, QueryKey } from "@tanstack/react-query";

const STORAGE_KEY = "crushclub:public-query-cache:v1";
const MAX_AGE_MS = 15 * 60_000;

type PersistedQuery = { queryKey: QueryKey; data: unknown; updatedAt: number };
type PersistedCache = { version: 1; savedAt: number; queries: PersistedQuery[] };

export function isPublicPersistableQuery(queryKey: QueryKey) {
  return (queryKey[0] === "events" || queryKey[0] === "raffles") && queryKey[1] === "public";
}

export function restorePublicQueries(queryClient: QueryClient) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const cache = JSON.parse(raw) as PersistedCache;
    if (cache.version !== 1 || Date.now() - cache.savedAt > MAX_AGE_MS || !Array.isArray(cache.queries)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    for (const query of cache.queries) {
      if (isPublicPersistableQuery(query.queryKey) && Date.now() - query.updatedAt <= MAX_AGE_MS) {
        queryClient.setQueryData(query.queryKey, query.data, { updatedAt: query.updatedAt });
      }
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function persistPublicQueries(queryClient: QueryClient) {
  const queries = queryClient.getQueryCache().getAll().flatMap((query) => {
    if (!isPublicPersistableQuery(query.queryKey) || query.state.data === undefined) return [];
    return [{ queryKey: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt }];
  });
  const cache: PersistedCache = { version: 1, savedAt: Date.now(), queries };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage can be unavailable or full; memory caching remains functional.
  }
}
