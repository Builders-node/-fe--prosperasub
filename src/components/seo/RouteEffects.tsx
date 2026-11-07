import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { loadGa, readConsent, trackPage } from "@/lib/analytics/ga";

/**
 * Per-route side effects that every page needs and no page should have to
 * remember:
 *  - `noindex` on a person's own pages, checkout and the admin (robots.txt
 *    disallows them too, but a link from elsewhere can still get them indexed);
 *  - a GA4 page view on every navigation, once the visitor has consented.
 */
const PRIVATE = [
  /^\/admin/, /^\/account/, /^\/my-/, /^\/cart/, /^\/checkout/, /\/checkout\//, /^\/history/,
  /^\/notifications/, /^\/claim-business/, /^\/verify/, /^\/oauth/, /^\/services\/food\/subscription\//,
];

function setRobots(noindex: boolean) {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!noindex) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("meta");
    el.name = "robots";
    document.head.appendChild(el);
  }
  el.content = "noindex, nofollow";
}

export function RouteEffects() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (readConsent() === "granted") loadGa();
  }, []);

  useEffect(() => {
    setRobots(PRIVATE.some((re) => re.test(pathname)) || new URLSearchParams(search).get("preview") === "1");
    // After the page's own title effect has run.
    const t = window.setTimeout(() => trackPage(pathname + search), 0);
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  return null;
}
