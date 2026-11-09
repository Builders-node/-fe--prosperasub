/**
 * Recovery from a deploy that happened while the page was open.
 *
 * The open page still knows the old chunk names; the server has the new ones,
 * so the next lazy screen fails with "Failed to fetch dynamically imported
 * module". The cure is one hard reload that fetches the fresh HTML.
 *
 * Two holes this closes:
 *  - the failure is caught by a React error boundary before it reaches the
 *    window handlers, so the boundary has to call this too;
 *  - the guard was "once per session": after the first deploy the flag stayed
 *    set and every later deploy showed "Something broke". It is now a time
 *    window — at most one reload per minute, so a genuinely missing file
 *    cannot loop.
 */
const RELOAD_KEY = "prospera-stale-chunk-reload-at";
const WINDOW_MS = 60_000;

export const looksLikeStaleChunk = (msg: string) =>
  /Failed to fetch dynamically imported module|Loading chunk .* failed|is not a valid JavaScript MIME type|Importing a module script failed|error loading dynamically imported module/i.test(msg);

/** Whether a reload would be allowed right now (no reload in the last minute). */
export function canAutoRecover(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) || 0) >= WINDOW_MS;
  } catch {
    return true;
  }
}

export function tryAutoRecover(msg: string): boolean {
  if (!looksLikeStaleChunk(msg)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false; // just reloaded — don't loop
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No storage: still reload once; the cache-busting param stops a loop on most browsers.
  }
  (async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // The reload below is the recovery, not this cleanup.
    }
    const url = new URL(location.href);
    url.searchParams.set("_t", String(Date.now()));
    location.replace(url.toString());
  })();
  return true;
}
