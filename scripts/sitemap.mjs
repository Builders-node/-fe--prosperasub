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
    entries.push(url(`/services/${a.key}`, { lastmod: a.updated_at, changefreq: "daily", priority: 0.9 }));
  }

  // Businesses. A provider page is the richest public page the platform has.
  const providers = await rows("providers?select=id,unit,updated_at&status=eq.active");
  for (const p of providers) {
    const path = p.unit === "vehicles" ? `/vehicles/providers/${p.id}` : null;
    if (path) entries.push(url(path, { lastmod: p.updated_at, priority: 0.8 }));
  }

  // Offers, by the id the storefront links them with.
  const plans = await rows("provider_plans?select=id,source_plan_id,source_service_key,updated_at&status=eq.active&visibility=eq.public&parent_plan_id=is.null");
  for (const plan of plans) {
    const service = plan.source_service_key || "plan";
    const id = plan.source_plan_id || plan.id;
    if (service === "food") continue; // food plans live under a provider-scoped URL
    entries.push(url(`/services/${service === "plan" ? "plans" : service}/plans/${id}`, {
      lastmod: plan.updated_at, priority: 0.7,
    }));
  }

  // Every car on the fleet.
  const vehicles = await rows("rental_vehicles?select=id,updated_at&status=eq.public");
  for (const v of vehicles) {
    entries.push(url(`/vehicles/vehicle/${v.id}`, { lastmod: v.updated_at, priority: 0.7 }));
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
