/**
 * Which app this origin serves.
 *
 * everysub.net and vehicles.everysub.net are one deployment of one codebase —
 * the car storefront is not a separate build, it is the same bundle deciding
 * by hostname which shell to mount. That is why the two share a session: they
 * are the same app, differing only in origin (see `sessionCookie` in the
 * Supabase client for the part localStorage cannot do across origins).
 */

/** Hosts that serve the car-rental storefront. */
const VEHICLES_HOSTS = new Set(["vehicles.everysub.net", "vehicles.prosperasub.com"]);

/** True on localhost / 127.0.0.1, where the dev override below is allowed. */
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

const DEV_OVERRIDE_KEY = "prospera_app_override";

/**
 * True when this origin is the vehicles storefront.
 *
 * In local development `?app=vehicles` switches to it and sticks for the tab,
 * so the car app can be worked on without a hosts-file entry. The override is
 * refused off localhost — production decides by hostname alone.
 */
export function isVehiclesHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase().replace(/^www\./, "");
  if (VEHICLES_HOSTS.has(hostname) || hostname.startsWith("vehicles.")) return true;

  if (!isLocalHost(hostname)) return false;
  try {
    const param = new URLSearchParams(window.location.search).get("app");
    if (param === "vehicles") sessionStorage.setItem(DEV_OVERRIDE_KEY, "vehicles");
    else if (param) sessionStorage.removeItem(DEV_OVERRIDE_KEY);
    return sessionStorage.getItem(DEV_OVERRIDE_KEY) === "vehicles";
  } catch {
    return false;
  }
}
