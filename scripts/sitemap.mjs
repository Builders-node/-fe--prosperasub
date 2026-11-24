// Build-time sitemap.
//
// The app is a single page: every URL serves the same index.html, so a crawler
// has no way to discover a plan or a provider except by executing the router
// and following links. A sitemap is the cheap half of the fix — it lists every
// public URL outright, with a real lastmod, so the crawl does not depend on
// how well a bot renders JavaScript.
//
// It reads the same anon key the browser uses, through PostgREST, and asks
// only for rows that are already public. If the database is unreachable it
// still writes the static routes rather than failing the build: a smaller
// sitemap is a worse outcome than no deploy.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** "beach-club-membership-1042" — src/lib/services/serviceUrls.ts wordsAddress. */
const wordsOf = (row) =>
  row.public_no === null || row.public_no === undefined ? null : row.slug ? `${row.slug}-${row.public_no}` : String(row.public_no);
const SITE = process.env.SITE_URL?.replace(/\/+$/, "") || "https://everysub.net";
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || "https://igbytraidldkhhamsfdo.supabase.co").replace(/\/+$/, "");
const ANON = process.env.VITE_SUPABASE_ANON_KEY || readAnonFromSource();

/** The key the bundle already ships; keeping one source avoids a second secret. */
function readAnonFromSource() {
  try {
    const cfg = readFileSyncSafe(resolve(HERE, "../src/integrations/supabase/config.ts"));
    return cfg?.match(/"(eyJ[A-Za-z0-9_.\-]+)"/)?.[1] ?? "";
  } catch { return ""; }
}
function readFileSyncSafe(p) {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}

async function rows(path) {
  if (!ANON) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

const url = (loc, { lastmod, changefreq = "weekly", priority = 0.6 } = {}) =>
  `  <url>\n    <loc>${SITE}${loc}</loc>\n` +
  (lastmod ? `    <lastmod>${String(lastmod).slice(0, 10)}</lastmod>\n` : "") +
  `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

const main = async () => {
  const entries = [
    url("/discovery", { changefreq: "daily", priority: 1.0 }),
    url("/vehicles", { changefreq: "daily", priority: 0.9 }),
    url("/search", { priority: 0.3 }),
  ];

  // Services a visitor can browse — the archetype is the listing.
  const archetypes = await rows("service_archetypes?select=key,updated_at&is_active=eq.true");
  for (const a of archetypes) {
    if (a.key === "vehicles" || a.key === "rental") continue; // /vehicles, above
    entries.push(url(`/services/${a.key}`, { lastmod: a.updated_at, changefreq: "daily", priority: 0.9 }));
  }

  // The URL segment a service uses (src/lib/services/serviceUrls.ts KEY_TO_SLUG).
  const slugOf = (key) => key;

  // Businesses. A provider page is the richest public page the platform has —
  // and only car rentals used to be listed, so Google had no address for any
  // restaurant, cleaner or club.
  // select=* so `slug` is read once the provider_slugs migration exists.
  const providers = await rows("providers?select=*&status=eq.active");
  const providerById = new Map(providers.map((p) => [p.id, p]));
  for (const p of providers) {
    let path = null;
    // The address in words when the business has one (see the provider_slugs migration).
    const seg = p.slug || p.id;
    if (p.unit === "vehicles" || p.archetype_key) path = `/businesses/${seg}`; // flat, like /plans/…
    if (path) entries.push(url(path, { lastmod: p.updated_at, priority: 0.8 }));
  }

  // Offers, by the id the storefront links them with — under their business's
  // service (the old code used the table's key, so universal plans pointed at
  // /services/plans/…, a page that does not exist).
  // select=* so the address in words (slug, public_no) is read once the
  // readable_plan_and_vehicle_urls migration exists; the old id until then.
  const plans = await rows("provider_plans?select=*&status=eq.active&visibility=eq.public&parent_plan_id=is.null");
  for (const plan of plans) {
    const p = providerById.get(plan.provider_id);
    if (!p || !p.archetype_key || p.unit === "vehicles") continue;
    const id = wordsOf(plan) ?? (plan.source_plan_id || plan.id);
    // Food's old provider-scoped plan URL only forwards here.
    const path = `/plans/${id}`;
    entries.push(url(path, { lastmod: plan.updated_at, priority: 0.7 }));
  }

  // The pages anyone may land on.
  entries.push(
    url("/for-business", { changefreq: "monthly", priority: 0.8 }),
    url("/how-it-works", { changefreq: "monthly", priority: 0.7 }),
    url("/pay-with-bitcoin", { changefreq: "weekly", priority: 0.8 }),
    url("/about", { changefreq: "monthly", priority: 0.5 }),
    url("/become-a-provider", { changefreq: "monthly", priority: 0.5 }),
    url("/support", { changefreq: "monthly", priority: 0.3 }),
    url("/terms", { changefreq: "yearly", priority: 0.2 }),
    url("/privacy", { changefreq: "yearly", priority: 0.2 }),
  );

  // Every car on the fleet.
  const vehicles = await rows("rental_vehicles?select=*&status=eq.public");
  for (const v of vehicles) {
    entries.push(url(`/cars/${wordsOf(v) ?? v.id}`, { lastmod: v.updated_at, priority: 0.7 }));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  writeFileSync(resolve(HERE, "../public/sitemap.xml"), xml);
  console.log(`▶ sitemap: ${entries.length} urls`);
};

main().catch((err) => {
  console.warn("sitemap: skipped —", err.message);
});
