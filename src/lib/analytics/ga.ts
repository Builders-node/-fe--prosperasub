/**
 * Google Tag Manager (→ GA4), loaded only after the visitor says yes.
 *
 * The container id is `VITE_GTM_ID` (default: EverySub's GTM-55NGLL5G — a
 * container id is public, it ships in every page that uses it). The GA4 tag
 * and its triggers live INSIDE the container: this file only loads GTM after
 * consent and pushes page views and GA4-shaped events to `dataLayer`.
 * "Decline" is remembered and nothing loads. Admin screens are never tracked.
 * The Privacy Policy describes exactly this (pages/legal/Privacy.tsx).
 */
export const GTM_ID = (import.meta.env.VITE_GTM_ID as string | undefined)?.trim() || "GTM-55NGLL5G";
/** Microsoft Clarity (session recordings, heatmaps) — same consent as GTM. */
export const CLARITY_ID = (import.meta.env.VITE_CLARITY_ID as string | undefined)?.trim() || "z9u1m2ek41";
/** Kept for the consent banner's "is analytics configured" check. */
export const GA_ID = GTM_ID;

const CONSENT_KEY = "everysub.analytics-consent";
export type Consent = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch { return null; }
}

export function saveConsent(v: Consent) {
  try { localStorage.setItem(CONSENT_KEY, v); } catch { /* private mode: ask again next time */ }
  if (v === "granted") loadGa();
  window.dispatchEvent(new Event("everysub:consent"));
}

let loaded = false;
const isAdminPath = (p: string) => p.startsWith("/admin");
const push = (o: Record<string, unknown>) => { (window.dataLayer = window.dataLayer || []).push(o); };

/** Clarity's standard bootstrap: a queueing stub, then the tag. */
function loadClarity() {
  if (!CLARITY_ID || window.clarity) return;
  const stub = ((...args: unknown[]) => { (stub.q = stub.q || []).push(args); }) as NonNullable<Window["clarity"]>;
  window.clarity = stub;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${encodeURIComponent(CLARITY_ID)}`;
  document.head.appendChild(s);
  window.clarity("consent");
}

/**
 * Recording follows the route: Clarity is stopped on admin screens (they show
 * customers' names, addresses and money) and started again outside them.
 */
export function clarityForPath(path: string) {
  if (!window.clarity || readConsent() !== "granted") return;
  window.clarity(isAdminPath(path) ? "stop" : "start");
}

/** Inject gtm.js and Clarity once, after consent. */
export function loadGa() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  if (!isAdminPath(window.location.pathname)) loadClarity();
  if (!GTM_ID) return;
  push({ "gtm.start": Date.now(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
  document.head.appendChild(s);
}

const ready = () => loaded && readConsent() === "granted";

/** A virtual page view — in GTM, trigger the GA4 tag on the custom event `page_view`. */
export function trackPage(path: string) {
  if (!ready() || isAdminPath(path)) return;
  push({ event: "page_view", page_path: path, page_location: window.location.href, page_title: document.title });
}

/**
 * A GA4-recommended event, pushed for GTM: view_item · begin_checkout ·
 * purchase · search · sign_up · login · generate_lead. Ecommerce params go in
 * `ecommerce` (cleared first, as GTM's GA4 ecommerce expects). Never pass
 * names, emails, phones or addresses.
 */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (!ready() || isAdminPath(window.location.pathname)) return;
  const { items, value, currency, transaction_id, ...rest } = params as Record<string, unknown>;
  if (items) {
    push({ ecommerce: null });
    push({ event: name, ...rest, ecommerce: { items, value, currency, transaction_id } });
  } else {
    push({ event: name, ...rest });
  }
}

/** A purchase/checkout item in GA4's shape, prices in dollars. */
export const gaItem = (i: { id: string; name: string; priceCents?: number | null; category?: string | null; brand?: string | null }) => ({
  item_id: i.id,
  item_name: i.name,
  ...(i.category ? { item_category: i.category } : {}),
  ...(i.brand ? { item_brand: i.brand } : {}),
  ...(i.priceCents != null ? { price: Math.round(i.priceCents) / 100 } : {}),
});
