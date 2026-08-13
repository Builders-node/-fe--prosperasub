/**
 * Warm a route's JavaScript chunk before the tap that needs it.
 *
 * Every page is `React.lazy`, so the first visit to a route has to fetch a
 * chunk before it can render anything. Two things make that invisible:
 * `v7_startTransition` on the router (the old screen stays up instead of
 * being replaced by a spinner), and this — starting the fetch on
 * `pointerdown`, which buys the ~100ms between a finger touching the glass
 * and the click firing, and on idle for the places everyone goes.
 *
 * The import paths must match the ones in App.tsx: Vite keys chunks by
 * resolved module, so `@/pages/Cart` here and `./pages/Cart` there are the
 * same chunk, and the second import is free.
 */

const CHUNKS: Record<string, () => Promise<unknown>> = {
  "/discovery": () => import("@/pages/Discovery"),
  "/search": () => import("@/pages/Search"),
  "/cart": () => import("@/pages/Cart"),
  "/my-subscriptions": () => import("@/pages/user/MySubscriptions"),
  "/account": () => import("@/pages/user/Profile"),
  "/notifications": () => import("@/pages/user/Notifications"),
  "/my-business": () => import("@/pages/user/MyBusiness"),
  "/services/cleaning": () => import("@/pages/cleaning/CleaningPackages"),
  "/services/food": () => import("@/pages/food/FoodListing"),
  "/services/beach-club": () => import("@/pages/beach/BeachClub"),
};

const started = new Set<string>();

/**
 * Safe to call on every pointerdown: the first call starts the fetch, the
 * rest are a Set lookup. An unknown path (a generic `/service/:key`, a detail
 * page) is simply not prefetched rather than an error.
 */
export function prefetchRoute(path: string | undefined | null): void {
  if (!path) return;
  const key = path.split("?")[0].replace(/\/+$/, "") || "/discovery";
  if (started.has(key)) return;
  const load = CHUNKS[key];
  if (!load) return;
  started.add(key);
  // A prefetch that fails is not an error the user should ever hear about:
  // the real navigation will retry and report properly.
  void load().catch(() => started.delete(key));
}

/** The tab bar's destinations, fetched once the app has stopped working. */
export function prefetchShellRoutes(paths: string[]): void {
  const run = () => paths.forEach(prefetchRoute);
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
