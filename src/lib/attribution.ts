/**
 * Where a buyer came from — the ad, the landing page, and which variant of it.
 *
 * Landing pages (beachclub.everysub.net) send people to checkout with utm_*
 * on the URL. Checkout is behind sign-in, and the Google round-trip drops the
 * query string, so the parameters are captured on the very first page load
 * and kept here until a purchase is written. `subscriptionWriter` copies them
 * into `provider_subscriptions.metadata.attribution`, which is what an A/B
 * test on a landing page is scored against: paid rows per `utm_content`.
 *
 * Last touch wins — a new visit with parameters replaces the old ones — and
 * an entry older than 30 days is ignored rather than credited to a campaign
 * that ended.
 */

const KEY = "everysub_attribution";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_variant", "gclid", "fbclid", "ref"];

export type Attribution = Partial<Record<(typeof PARAMS)[number], string>> & { landed_at: string };

export function captureAttribution(search: string = window.location.search): void {
  try {
    const q = new URLSearchParams(search);
    const found: Record<string, string> = {};
    for (const k of PARAMS) {
      const v = q.get(k);
      if (v) found[k] = v.slice(0, 200);
    }
    if (!Object.keys(found).length) return;
    localStorage.setItem(KEY, JSON.stringify({ ...found, landed_at: new Date().toISOString() }));
  } catch {
    // Storage blocked (private mode, quota) — attribution is best-effort.
  }
}

export function readAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Attribution;
    if (!a.landed_at || Date.now() - Date.parse(a.landed_at) > MAX_AGE_MS) return null;
    return a;
  } catch {
    return null;
  }
}
