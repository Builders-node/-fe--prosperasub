import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Where the window stands when a page changes.
 *
 *  - A new page (a link, navigate(), a redirect) opens at the top. Without
 *    this the window kept the previous page's scroll: with `v7_startTransition`
 *    the old screen stays up until the new one is ready, so nothing ever
 *    shrinks the document back to the top on the way.
 *  - Back / Forward returns to where the visitor was on that entry.
 *  - Only a change of path counts: a ?filter or ?tab change on the same page
 *    keeps the place, and a #anchor scrolls to its element.
 *
 * Positions are kept per history entry (location.key) in sessionStorage, so
 * they also survive a reload of the tab.
 */
const STORE = "scroll-positions";
const MAX_ENTRIES = 60;

function readStore(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || "{}") ?? {};
  } catch {
    return {};
  }
}

function writeStore(positions: Record<string, number>) {
  try {
    const keys = Object.keys(positions);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete positions[k];
    }
    sessionStorage.setItem(STORE, JSON.stringify(positions));
  } catch {
    /* private mode / quota: positions just aren't remembered */
  }
}

// `html { scroll-behavior: smooth }` would otherwise animate every jump.
function jumpTo(top: number) {
  window.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior });
}

export function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const positions = useRef<Record<string, number>>(readStore());
  const currentKey = useRef(location.key);
  const prevPath = useRef<string | null>(null);

  // The app decides; the browser's own restoration would fight it on Back.
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const before = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = before;
    };
  }, []);

  // Remember where the visitor is on the current entry.
  useEffect(() => {
    let frame = 0;
    const save = () => {
      positions.current[currentKey.current] = window.scrollY;
      writeStore(positions.current);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        positions.current[currentKey.current] = window.scrollY;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Runs once the new page has committed, before it paints.
  useLayoutEffect(() => {
    const pathChanged = prevPath.current !== null && prevPath.current !== location.pathname;
    const firstRender = prevPath.current === null;
    prevPath.current = location.pathname;

    // Persist the entry we are leaving.
    positions.current[currentKey.current] = positions.current[currentKey.current] ?? window.scrollY;
    writeStore(positions.current);
    currentKey.current = location.key;

    if (location.hash) {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView();
        return;
      }
    }

    if (navType === "POP") {
      const saved = positions.current[location.key];
      if (saved == null) {
        if (pathChanged) jumpTo(0);
        return;
      }
      // The page may still be filling in (data, photos): keep trying until
      // it is tall enough, or the visitor scrolls themselves.
      let tries = 0;
      let frame = 0;
      const stop = () => {
        if (frame) window.cancelAnimationFrame(frame);
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
        window.removeEventListener("keydown", stop);
      };
      const attempt = () => {
        jumpTo(saved);
        tries += 1;
        if (Math.abs(window.scrollY - saved) <= 2 || tries > 90) return stop();
        frame = window.requestAnimationFrame(attempt);
      };
      window.addEventListener("wheel", stop, { passive: true, once: true });
      window.addEventListener("touchstart", stop, { passive: true, once: true });
      window.addEventListener("keydown", stop, { once: true });
      attempt();
      return stop;
    }

    if (pathChanged && !firstRender) jumpTo(0);
    // location.key covers every navigation, including to the same path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return null;
}
