/**
 * Spanish lives at its own addresses: /es/services/food, /es/guides/… .
 *
 * The app had a Spanish dictionary behind a switch in localStorage, so every
 * URL had one language to a search engine — English. Google ranks a page in
 * the language its URL serves, so "limpieza a domicilio Roatán" had nothing to
 * find. Now the router runs under the basename /es (src/App.tsx) and the pages
 * below are written in both languages, with hreflang pointing each at the other.
 *
 * Only pages whose words really change go in BILINGUAL; anything else under
 * /es keeps its English canonical, so it is not a duplicate.
 *
 * No imports on purpose: middleware.ts and scripts/sitemap.mjs read this too.
 */
export const ES_PREFIX = "/es";

/** Paths (without /es) that are written in both languages. */
export const BILINGUAL: RegExp[] = [
  /^\/discovery$/, /^\/services\/[a-z0-9_-]+$/, /^\/vehicles$/, /^\/guides$/, /^\/guides\/[a-z0-9-]+$/,
];

export const isBilingual = (path: string) => BILINGUAL.some((re) => re.test(path));

/** "/es/services/food" → { lang: "es", path: "/services/food" }. */
export function splitLang(pathname: string): { lang: "en" | "es"; path: string } {
  if (pathname === ES_PREFIX || pathname.startsWith(`${ES_PREFIX}/`)) {
    return { lang: "es", path: pathname.slice(ES_PREFIX.length) || "/discovery" };
  }
  return { lang: "en", path: pathname };
}

/** The address of `path` in a language. */
export const langPath = (path: string, lang: "en" | "es") => (lang === "es" ? `${ES_PREFIX}${path}` : path);

/** True while the app runs under /es. */
export function inSpanishUrl(): boolean {
  return typeof window !== "undefined" && splitLang(window.location.pathname).lang === "es";
}
