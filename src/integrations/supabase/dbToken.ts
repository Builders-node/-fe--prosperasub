/**
 * The signed-in person's token for direct database calls.
 *
 * The browser talks to Supabase PostgREST directly. It used to do that with
 * the anon key for everyone, so the database could not tell one person from
 * another and every table the app touches had to be open to the whole
 * internet — customer names, WhatsApp numbers and addresses included.
 *
 * Now, while someone is signed in, the backend (`GET /auth/db-token`) gives us
 * a short-lived JWT signed with the project's secret: PostgREST runs the
 * request as `authenticated` with `auth.uid()` = that person, and row-level
 * security decides what they may see. Signed out — or when the backend does
 * not issue tokens yet (503) — we return null and the client falls back to the
 * anon key, exactly as before, so shipping this changes nothing by itself.
 */
import { apiUrlFor } from "@/integrations/supabase/config";

export type DbTokenDeps = {
  /** The current session's access token, refreshed if it is about to expire. */
  getAccessToken: () => Promise<string | null>;
  fetch: typeof fetch;
  now: () => number;
};

type Cached = { forAccess: string; token: string; expiresAt: number };

/** Ask again no sooner than this after the backend said "not configured". */
const UNAVAILABLE_BACKOFF_MS = 10 * 60_000;
/** Refresh this long before the token expires. */
const EARLY_MS = 60_000;

export function createDbTokenSource(deps: DbTokenDeps) {
  let cached: Cached | null = null;
  let unavailableUntil = 0;
  let inflight: Promise<string | null> | null = null;

  const fetchToken = async (access: string): Promise<string | null> => {
    try {
      const res = await deps.fetch(apiUrlFor("/auth/db-token"), {
        headers: { Authorization: `Bearer ${access}` },
        cache: "no-store",
      });
      if (res.status === 503 || res.status === 404) {
        unavailableUntil = deps.now() + UNAVAILABLE_BACKOFF_MS;
        return null;
      }
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      const token = body?.access_token;
      const ttl = Number(body?.expires_in);
      if (typeof token !== "string" || !token || !Number.isFinite(ttl)) return null;
      cached = { forAccess: access, token, expiresAt: deps.now() + ttl * 1000 };
      return token;
    } catch {
      // Network trouble: carry on as anon rather than fail the query.
      return null;
    }
  };

  return {
    async get(): Promise<string | null> {
      const access = await deps.getAccessToken().catch(() => null);
      if (!access) { cached = null; return null; }
      if (cached && cached.forAccess === access && cached.expiresAt - EARLY_MS > deps.now()) return cached.token;
      if (deps.now() < unavailableUntil) return null;
      if (!inflight) inflight = fetchToken(access).finally(() => { inflight = null; });
      return inflight;
    },
    /** Forget everything — on sign-in, sign-out or a role change. */
    reset() { cached = null; unavailableUntil = 0; },
  };
}
