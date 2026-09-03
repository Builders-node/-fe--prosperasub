/**
 * The session, and every call that carries it.
 *
 * Cookies, storage, refresh, and the three `api()` wrappers — about 300 lines
 * that used to live in the middle of a 1,900-line file alongside a Supabase
 * query builder and a set of cleaning-package helpers. They are the part of
 * that file most often changed and most often read (twice today alone: the
 * refresh that could hang forever, and the 500 that stopped a stale token from
 * ever being refreshed), and they had no address of their own.
 *
 * Everything is re-exported from client.ts, so no call site moved.
 */
import { API_URL } from "@/integrations/supabase/config";

export type AuthStateChangeCallback = (event: "SIGNED_IN" | "SIGNED_OUT", session: any) => void;

export type StoredSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: any;
  roles?: string[];
};

/** Subscribers to SIGNED_IN / SIGNED_OUT — the wrapper's onAuthStateChange. */
export const authStateListeners = new Set<AuthStateChangeCallback>();

export const SESSION_KEY = "prospera_owned_session";
export const GOOGLE_OAUTH_STATE_KEY = "prospera_google_oauth_state";

/**
 * The session, shared across everysub.net and vehicles.everysub.net.
 *
 * They are separate origins, so they have separate localStorage: signing in on
 * the marketplace left the car storefront still showing "Log in". A cookie
 * scoped to the parent domain is the one store both origins can read, so the
 * session is mirrored into it. It carries the same token localStorage already
 * holds — a cookie the browser must read cannot be httpOnly — so this widens
 * where the session is visible, not how exposed it is. Logging out clears it,
 * which signs the other origin out too.
 */
const SESSION_COOKIE = "prospera_session";
const SHARED_SESSION_DOMAINS = ["everysub.net", "prosperasub.com"];
/** A cookie must fit in 4KB; skip rather than write half a session. */
const SESSION_COOKIE_MAX = 3800;

/** ".everysub.net" for any host under it — null on localhost, which needs no sharing. */
const sharedSessionDomain = (): string | null => {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  const base = SHARED_SESSION_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
  return base ? `.${base}` : null;
};

const writeSessionCookie = (payload: unknown) => {
  const domain = sharedSessionDomain();
  if (!domain) return;
  try {
    const value = encodeURIComponent(JSON.stringify(payload));
    if (value.length > SESSION_COOKIE_MAX) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${SESSION_COOKIE}=${value}; Domain=${domain}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
  } catch {
    // A session that cannot be shared must still work on this origin.
  }
};

const readSessionCookie = (): StoredSession | null => {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!hit) return null;
  try {
    return JSON.parse(decodeURIComponent(hit.slice(SESSION_COOKIE.length + 1))) as StoredSession;
  } catch {
    return null;
  }
};

/**
 * Sessions that predate the shared cookie live only in this origin's
 * localStorage. Mirror one out the first time it is read so an already
 * signed-in visitor carries over to the sibling host without re-authenticating.
 * Once per page load — this runs on every API call.
 */
let sessionCookieBackfilled = false;
const backfillSessionCookie = (session: StoredSession) => {
  if (sessionCookieBackfilled) return;
  sessionCookieBackfilled = true;
  if (!readSessionCookie()) writeSessionCookie(session);
};

const clearSessionCookie = () => {
  const domain = sharedSessionDomain();
  if (!domain) return;
  document.cookie = `${SESSION_COOKIE}=; Domain=${domain}; Path=/; Max-Age=0; SameSite=Lax`;
};

export const readStoredSession = (): StoredSession | null => {
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    // First visit to this origin — adopt the session the sibling host stored.
    const shared = readSessionCookie();
    if (!shared) return null;
    localStorage.setItem(SESSION_KEY, JSON.stringify(shared));
    return shared;
  }

  try {
    const session = JSON.parse(raw) as StoredSession;
    if (sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      writeSessionCookie(session);
    }
    backfillSessionCookie(session);
    return session;
  } catch {
    clearStoredSession();
    return null;
  }
};

export const clearStoredSession = () => {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  clearSessionCookie();
};

const isSessionExpiring = (session: StoredSession | null) => {
  if (!session?.access_token || !session.expires_at) return true;
  return session.expires_at <= Math.floor(Date.now() / 1000) + 60;
};

const isAuthEndpoint = (path: string) =>
  path.startsWith("/auth/login") ||
  path.startsWith("/auth/signup") ||
  path.startsWith("/auth/refresh") ||
  path.startsWith("/auth/password-reset") ||
  path.startsWith("/auth/google");

/** A refresh may not outlive this; see the comment on the fetch below. */
const REFRESH_TIMEOUT_MS = 15_000;

export async function refreshStoredSession() {
  const current = readStoredSession();
  if (!current?.refresh_token) {
    clearStoredSession();
    return null;
  }

  // Bounded on purpose. `api()` wraps its own request in an AbortController,
  // but it awaits THIS first — so a refresh that never settles is not a slow
  // API call, it is an api() that never returns. Every admin page behind
  // `requiredPermissions` then sits on a full-screen spinner forever, because
  // the gate's "a failed fetch means we don't know, let them through" escape
  // only fires on a failure and a hang is never a failure. An expired session
  // routes every single call through here, so it is the whole admin panel.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
      signal: controller.signal,
    });
  } catch {
    // A network blip (or our own timeout) is not proof the session is dead —
    // keep it and let the caller's own request decide.
    return current;
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.session) {
    clearStoredSession();
    notifyAuthStateChange("SIGNED_OUT", null);
    return null;
  }

  const session = {
    ...data.session,
    user: data.user,
    roles: data.roles || [],
  };
  storeSession(session);
  notifyAuthStateChange("SIGNED_IN", session);
  return session;
}

export async function getValidStoredSession() {
  const session = readStoredSession();
  if (!session) return null;
  if (!isSessionExpiring(session)) return session;
  return refreshStoredSession();
}

// Some admin endpoints do a lot of server-side work (create dozens of bookings,
// push events to Google Calendar, etc.) and comfortably exceed 10s. Give those
// paths a longer budget so the client doesn't abort while the server is still
// working.
const LONG_RUNNING_PATTERNS = [
  /\/subscriptions\/with-reservations$/,
  /\/cleaning\/bookings\/sync-calendar$/,
  /\/cleaning\/calendar\/reconcile$/,
  /\/cleaning\/bookings\/.+\/sync-calendar$/,
  /\/cleaning\/bookings\/.+\/sync-direct$/,
  /\/payment-reminders\/remind-unpaid$/,
];
function timeoutForPath(path: string): number {
  return LONG_RUNNING_PATTERNS.some((re) => re.test(path)) ? 60_000 : 20_000;
}

export async function api(path: string, init?: RequestInit, retryOnUnauthorized = true) {
  const session = isAuthEndpoint(path) ? null : await getValidStoredSession();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutForPath(path));

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    window.clearTimeout(timeout);
    return {
      data: null,
      error: new Error(error instanceof DOMException && error.name === "AbortError" ? "API request timed out" : "API request failed"),
    };
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);

  /**
   * Recover from a stale token even when the API misreports one.
   *
   * The correct signal is 401, and the client has always refreshed on it. But
   * the API renders an unverifiable token as **500**: jwt.verify throws, and a
   * raw JsonWebTokenError is not an HttpException, so Nest calls it an internal
   * error. (Fixed in SessionService; that fix cannot ship until the API's
   * deploy pipeline is working again.)
   *
   * The status code was the whole failure. Refreshing on 401 alone meant an
   * expired token produced no prompt and no recovery — every admin and account
   * request failed forever while the app still showed the user signed in, and
   * only a manual re-login cleared it. So a 500 on a request we actually
   * authenticated is treated as possibly-stale auth and earns the same single
   * refresh-and-retry.
   *
   * Bounded by `retryOnUnauthorized`, so this happens at most once per call. A
   * genuine 500 costs one extra request and is then reported as it was before.
   */
  const maybeStaleAuth =
    response.status === 401 || (response.status === 500 && !!session?.access_token);

  if (maybeStaleAuth && retryOnUnauthorized && !isAuthEndpoint(path)) {
    const refreshedSession = await refreshStoredSession();
    if (refreshedSession?.access_token) {
      return api(path, init, false);
    }
  }

  if (!response.ok) {
    return { data: null, error: new Error(data?.message || "API request failed") };
  }

  return { data, error: null };
}

export async function adminApi(path: string, init?: RequestInit) {
  return api(path, init);
}

/** Authenticated API calls for the user-facing account portal */
export async function accountApi(path: string, init?: RequestInit) {
  return api(path, init);
}

export function getStoredSession() {
  return readStoredSession();
}

export function storeSession(payload: any) {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  // Mirror to the shared cookie so the other *.everysub.net origin sees it.
  writeSessionCookie(payload);
}

export function ownedUserFromSession() {
  return getStoredSession()?.user ?? null;
}

export function notifyAuthStateChange(event: "SIGNED_IN" | "SIGNED_OUT", session: any) {
  authStateListeners.forEach((callback) => {
    setTimeout(() => callback(event, session), 0);
  });
}



export function getOwnedUserDetails() {
  const user = ownedUserFromSession();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? user.displayName ?? user.display_name ?? null,
    display_name: user.displayName ?? user.display_name ?? user.name ?? null,
  };
}

