import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { newerBuildIsOut } from "@/lib/appVersion";

/** How often an open tab asks whether a new build is out. */
const CHECK_EVERY_MS = 5 * 60_000;
/** A tab hidden at least this long reloads at once when it comes back. */
const AWAY_LONG_MS = 60_000;

/**
 * Keeps an open tab on the current build (lib/appVersion).
 *
 * It looks every few minutes and whenever the tab comes back to the
 * foreground. When a newer build is out it does not yank the page from under
 * someone mid-typing: it reloads on the NEXT navigation — the screen is
 * changing anyway — or at once if the tab was in the background for a while
 * (nobody is looking at it then). A payment screen is never reloaded by this:
 * leaving it is a navigation, and that is the moment the reload happens.
 */
export function VersionWatcher() {
  const { pathname, search } = useLocation();
  const stale = useRef(false);
  const first = useRef(true);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (stale.current) return;
      if (await newerBuildIsOut() && !cancelled) stale.current = true;
    };
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      await check();
      if (stale.current && away >= AWAY_LONG_MS) window.location.reload();
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisibility);
    void check();
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  // A navigation with a newer build out: load the new page fresh instead.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (stale.current) window.location.reload();
  }, [pathname, search]);

  return null;
}
