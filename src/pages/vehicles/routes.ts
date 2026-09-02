/**
 * Where the car storefront lives inside the app.
 *
 * It used to be served from its own origin (vehicles.everysub.net) as the same
 * bundle picked by hostname, so every link inside it was written as if it owned
 * the root. It is now a section of one app mounted under a path prefix, and
 * every in-shell link resolves through here rather than repeating the prefix —
 * moving the section again is this one constant, not a grep across the tree.
 */

/** The path the car storefront is mounted at. */
export const VEHICLES_BASE = "/vehicles";

/** An absolute in-app path inside the car storefront; no argument is its home. */
export const carPath = (sub = ""): string => {
  const tail = sub.replace(/^\/+/, "");
  return tail ? `${VEHICLES_BASE}/${tail}` : VEHICLES_BASE;
};

/**
 * A path with its trailing slash removed, so "/vehicles/" and "/vehicles"
 * compare equal. The 301 from the retired subdomain lands people on the former,
 * and without this the tab bar showed no active tab on arrival.
 */
export const trimPath = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, "") : p);
