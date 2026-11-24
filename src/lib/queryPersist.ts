import type { QueryClient, Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

/**
 * The home page's public data, kept between visits.
 *
 * Opening the site used to start from nothing every time: ~20 requests to
 * Supabase, 2–3 seconds of skeletons, then the page assembling itself block by
 * block. These queries are the same for every visitor (catalogue, plans,
 * banners — never anything about the person), so the last answer is saved in
 * localStorage and drawn at once on the next visit, while a fresh copy is
 * fetched behind it (it comes back stale, so react-query refetches on mount).
 *
 * Only the keys listed here are ever written: an account's subscriptions,
 * orders or admin lists stay in memory only, as before.
 */
const PUBLIC_KEYS = new Set([
  "service-categories",
  "service-archetypes",
  "active-ads",
  "home-all-plans",
  "category-highlights-facts",
  "home-collections",
  "home-businesses",
  "promotions-active",
  "tag-dictionary",
  "food-residences",
]);

const DAY = 24 * 60 * 60 * 1000;

const isPublic = (query: Pick<Query, "queryKey">) =>
  typeof query.queryKey[0] === "string" && PUBLIC_KEYS.has(query.queryKey[0]);

/** Keep the public queries around long enough to be saved, even after their screen unmounts. */
export function keepPublicQueries(client: QueryClient) {
  for (const key of PUBLIC_KEYS) client.setQueryDefaults([key], { gcTime: DAY });
}

export function persistOptions(): Omit<PersistQueryClientOptions, "queryClient"> {
  const storage = (() => {
    try {
      const probe = "__rq_probe";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return undefined; // private mode, blocked storage: just don't persist
    }
  })();
  return {
    persister: createSyncStoragePersister({ storage, key: "everysub-query-cache", throttleTime: 2000 }),
    maxAge: DAY,
    // A new deploy may change what a query returns; never draw an old build's shape.
    buster: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev",
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === "success" && isPublic(query),
    },
  };
}
