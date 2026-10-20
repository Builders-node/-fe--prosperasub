/**
 * Where this app talks to.
 *
 * Split out of client.ts so the session layer can have the API's address
 * without importing the 1,500-line Supabase wrapper that sits below it — the
 * two were only ever in one file because everything was.
 */
const resolveApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  const fallbackUrl = "http://127.0.0.1:8082";

  if (configuredUrl && !configuredUrl.includes("127.0.0.1") && !configuredUrl.includes("localhost")) {
    return configuredUrl;
  }

  if (typeof window !== "undefined") {
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!isLocalHost) {
      return "https://api.prosperasub.com";
    }
  }

  return configuredUrl || fallbackUrl;
};

export const API_URL = resolveApiUrl();

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://igbytraidldkhhamsfdo.supabase.co";

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYnl0cmFpZGxka2hoYW1zZmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQxMzEsImV4cCI6MjA5NTU3MDEzMX0.VbaT7LMvtwswdfyDZI1rWkZtKSC0ICBDHeVbO4hLJeI";

/**
 * The NestJS API is moving into Supabase one endpoint at a time
 * (backend/supabase/functions/api). A path listed here is served by the Edge
 * Function; everything else still goes to API_URL. Moving an endpoint is adding
 * its pattern here once the Edge route is deployed and checked — and moving it
 * back is deleting the line.
 */
// The dev branch builds with VITE_EDGE_API_URL pointing at the `api-dev` copy
// of the function (Vercel Preview env), so backend changes are tried there
// before `api` — production — is redeployed.
export const EDGE_API_URL =
  (import.meta.env.VITE_EDGE_API_URL as string | undefined)?.trim() || `${SUPABASE_URL}/functions/v1/api`;

const EDGE_ROUTES: RegExp[] = [
  /^\/health$/,
  /^\/analytics\/(summary|revenue)$/,
  /^\/support\/messages$/,
  /^\/admin\/support\/messages(\/[^/]+)?$/,
  // Both halves of the access QR move together: the Edge verify secret is not Nest's.
  /^\/verify\/token$/,
  /^\/verify-access$/,
  /^\/account\/locations(\/[^/]+(\/default)?)?$/,
  // PayPal auto-renew (Edge only — Nest never had it).
  /^\/payments\/paypal\/subscription\/config$/,
  /^\/payments\/paypal\/subscriptions(\/[^/]+\/activate)?$/,
  /^\/account\/subscriptions\/[^/]+\/auto-renew\/cancel$/,
  // Cancel/resume moved with it: for a PayPal-renewed membership they must
  // suspend/re-activate PayPal billing too.
  /^\/account\/(cleaning|food|beach|plan)\/subscriptions\/[^/]+\/(cancel|resume)$/,
];

/** Full URL for an API path — the Edge Function if that path has moved, else the Nest API. */
export function apiUrlFor(path: string): string {
  const bare = path.split("?")[0];
  return EDGE_ROUTES.some((re) => re.test(bare)) ? `${EDGE_API_URL}${path}` : `${API_URL}${path}`;
}
