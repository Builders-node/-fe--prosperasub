// A/B split for the Beach Club landing — Vercel Routing Middleware.
//
// `/` is served from `a/index.html` or `b/index.html` without a redirect: the
// address bar stays on beachclub.everysub.net and nothing flickers. The first
// visit draws a variant at random and pins it in a cookie for 30 days, so one
// person always sees one page. `?ab=a` / `?ab=b` forces (and re-pins) a
// variant for checking by hand. Each page tags its checkout link with
// `landing_variant`, which the app stores on the subscription row — that is
// what the test is scored against (see frontend/src/lib/attribution.ts).
//
// No imports on purpose: the project has no install step, and a rewrite is
// just the `x-middleware-rewrite` header that `@vercel/functions` would set.

const COOKIE = "bc_ab";
const VARIANTS = ["a", "b"];

export const config = { matcher: ["/"] };

export default function middleware(request) {
  const url = new URL(request.url);
  const forced = url.searchParams.get("ab");
  const pinned = (request.headers.get("cookie") || "").match(/(?:^|;\s*)bc_ab=([ab])(?:;|$)/);

  let variant = VARIANTS.includes(forced) ? forced : pinned && pinned[1];
  const assign = !variant || VARIANTS.includes(forced);
  if (!variant) variant = Math.random() < 0.5 ? "a" : "b";

  const headers = new Headers({ "x-middleware-rewrite": new URL("/" + variant + url.search, url).toString() });
  if (assign) headers.append("set-cookie", `${COOKIE}=${variant}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
  return new Response(null, { headers });
}
