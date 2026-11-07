/**
 * Google Analytics 4, loaded only after the visitor says yes.
 *
 * The measurement id comes from `VITE_GA_MEASUREMENT_ID` (Vercel env). Without
 * it nothing loads and no banner shows. With it, the consent banner asks once;
 * "Decline" is remembered and nothing is sent. Admin screens are never
 * tracked. The Privacy Policy describes exactly this (pages/legal/Privacy.tsx).
 */
export const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() || "";

const CONSENT_KEY = "everysub.analytics-consent";
export type Consent = "granted" | "denied";

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
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

/** Inject gtag.js once. Page views are sent by `trackPage`, not automatically. */
export function loadGa() {
  if (loaded || !GA_ID || typeof window === "undefined") return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false, anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

const ready = () => loaded && !!window.gtag && readConsent() === "granted";

export function trackPage(path: string) {
  if (!ready() || isAdminPath(path)) return;
  window.gtag!("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/**
 * A GA4 event. Use the recommended names so reports fill themselves:
 * view_item · begin_checkout · purchase · search · sign_up · login · generate_lead.
 * Never pass names, emails, phones or addresses.
 */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (!ready() || isAdminPath(window.location.pathname)) return;
  window.gtag!("event", name, params);
}

/** A purchase/checkout item in GA4's shape, prices in dollars. */
export const gaItem = (i: { id: string; name: string; priceCents?: number | null; category?: string | null; brand?: string | null }) => ({
  item_id: i.id,
  item_name: i.name,
  ...(i.category ? { item_category: i.category } : {}),
  ...(i.brand ? { item_brand: i.brand } : {}),
  ...(i.priceCents != null ? { price: Math.round(i.priceCents) / 100 } : {}),
});
