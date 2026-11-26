/**
 * Real HTML for the robots that read raw HTML.
 *
 * This is a single-page app: every URL answers with index.html, whose only
 * content is a script. Two kinds of robot suffer:
 *  - link-preview bots (WhatsApp, Telegram, X, Slack…) read Open Graph tags
 *    and saw the site-wide card for every restaurant, plan and car;
 *  - search and AI crawlers. Googlebot renders JavaScript, late and not
 *    always; Bing, DuckDuckGo, Yandex, ChatGPT, Perplexity and Claude mostly
 *    don't — they indexed an empty page with a generic title and no H1.
 *
 * For those robots only, this Vercel Routing Middleware answers with a small
 * page carrying the same content the app shows: the title, the description,
 * an H1, the offers with their prices, links to the businesses and plans, and
 * schema.org JSON-LD. It is the same public data the storefront renders (the
 * anon key every browser already holds) — not different content for robots,
 * which would be cloaking. Any failure falls through to the normal app.
 *
 * Also: `/` is a permanent redirect to /discovery at the edge (it used to be a
 * client-side redirect, so the bare domain looked empty), keeping the query
 * string — business QR codes carry `?ref=`.
 *
 * `?_og=1` forces the robot page, for checking it from a browser.
 *
 * Spanish: /es/<path> answers in Spanish for the pages listed in
 * src/lib/seo/lang.ts BILINGUAL, with hreflang tying each language to the
 * other. Any other /es address falls through to the app, whose canonical is
 * the English page.
 */
import { faqJsonLd, serviceSeo } from "./src/lib/seo/serviceSeo";
import { GUIDES, GUIDES_INDEX, guideBySlug, guideExtras } from "./src/lib/seo/guides";
import { isBilingual, langPath, splitLang } from "./src/lib/seo/lang";
import { popularFor, popularText, type PopularGroup } from "./src/lib/seo/popular";

export const config = {
  matcher: ["/", "/services/:path*", "/businesses/:path*", "/plans/:path*", "/cars/:path*", "/vehicles/:path*", "/discovery", "/for-business", "/become-a-provider", "/how-it-works", "/pay-with-bitcoin", "/about", "/collections", "/collections/:path*", "/guides", "/guides/:path*", "/terms", "/privacy", "/support", "/es", "/es/:path*"],
};

const PREVIEW_BOT = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Pinterest|SkypeUriPreview|vkShare|redditbot|Embedly|Iframely|bitlybot|Applebot/i;
const SEARCH_BOT = /Googlebot|Google-InspectionTool|bingbot|BingPreview|DuckDuckBot|YandexBot|Baiduspider|Slurp|GPTBot|OAI-SearchBot|ChatGPT-User|PerplexityBot|Perplexity-User|ClaudeBot|Claude-SearchBot|Claude-User|anthropic-ai|CCBot|Amazonbot|Bytespider/i;

const SITE = "https://everysub.net";
const SUPABASE_URL = "https://igbytraidldkhhamsfdo.supabase.co";
// The public anon key — the same one every browser already receives in the bundle.
const ANON = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYnl0cmFpZGxka2hoYW1zZmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQxMzEsImV4cCI6MjA5NTU3MDEzMX0.VbaT7LMvtwswdfyDZI1rWkZtKSC0ICBDHeVbO4hLJeI";

const DEFAULT = {
  title: "EverySub — Subscriptions in Roatán",
  description: "Subscriptions for life on Roatán — meals, cleaning, memberships, vehicles and more, paid by Lightning, Bitcoin, card or PayPal.",
  image: `${SITE}/icon-512.png`,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[0-9a-zA-Z-]{1,90}$/;
/**
 * An address of words ends in the row's number: beach-club-membership-1042
 * (src/lib/services/serviceUrls.ts publicNoOf). The number finds the row; the
 * words are for people, so stale words after a rename are sent on with a 301.
 */
const WORDS = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?(\d{1,12})$/;
const publicNoOf = (seg: string) => (UUID.test(seg) ? null : WORDS.exec(seg)?.[1] ?? null);
const wordsOf = (row: { slug?: string | null; public_no?: number | string | null }) =>
  row.public_no === null || row.public_no === undefined ? null : row.slug ? `${row.slug}-${row.public_no}` : String(row.public_no);

const pass = () => new Response(null, { headers: { "x-middleware-next": "1" } });

async function rows<T = any>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

/** The same, but `null` when the database could not answer — so "no such row" can be told from "no answer". */
async function rowsOk<T = any>(path: string): Promise<T[] | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as T[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: string | null | undefined, n = 200) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const usd = (cents: number | null | undefined) => (cents ? `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}` : null);
const PERIOD: Record<string, string> = { week: "week", weekly: "week", month: "month", monthly: "month", quarterly: "quarter", year: "year", yearly: "year", one_time: "" };
const priceLine = (cents: number | null, period: string | null) => {
  const p = usd(cents);
  const per = PERIOD[String(period ?? "")] ?? "";
  return p ? `${p}${per ? ` / ${per}` : ""}` : null;
};
/**
 * The URL segment a service uses — its key, as src/lib/services/serviceUrls.ts
 * spells it. (The beach club's old /services/beach-club listing is gone; the
 * club is one business in the service it is filed under.)
 */
const slugOf = (key: string) => key;
/** A business's address: its slug (words) when it has one, else its uuid. */
/** A business's one address, flat: /businesses/<slug> (rental companies too). */
const providerPath = (p: { id: string; slug?: string | null; unit?: string | null; archetype_key?: string | null }) =>
  p.unit === "vehicles" || p.archetype_key ? `/businesses/${p.slug || p.id}` : null;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
type Worded = { slug?: string | null; public_no?: number | string | null };
/**
 * Flat addresses, like a shop's product page: /plans/<words>-<number>,
 * /cars/<words>-<number>. The service is not in them (the breadcrumbs say
 * where a plan sits), so moving a business to another service moves nothing.
 */
const planPath = (plan: { id: string; source_plan_id?: string | null } & Worded, _archetype?: string) =>
  `/plans/${wordsOf(plan) ?? (plan.source_plan_id || plan.id)}`;
const carHref = (v: { id: string } & Worded) => `/cars/${wordsOf(v) ?? v.id}`;

interface Link { href: string; label: string; note?: string | null }
interface Page {
  title: string;
  description: string;
  image: string;
  type: "website" | "product" | "business.business" | "article";
  /** Headed paragraphs — a guide's body. */
  sections?: Array<{ h: string; p: string[] }>;
  h1?: string;
  /** Plain paragraphs under the H1. */
  text?: string[];
  /** Named lists of links — the offers, the businesses, the services. */
  lists?: Array<{ heading: string; links: Link[] }>;
  crumbs?: Link[];
  jsonLd?: Record<string, unknown>[];
  /** Questions and answers, drawn on the page — the FAQPage JSON-LD repeats them. */
  faq?: Array<{ q: string; a: string }>;
  /** Review texts, drawn on the page — the Review JSON-LD repeats them. */
  quotes?: Array<{ who: string; rating: number | null; text: string }>;
  /** Answer with a 301 to this path instead (an old uuid address of a business). */
  redirect?: string;
  /** The address names a business, plan, car or collection that does not exist (or is no longer public): answer 404. */
  notFound?: boolean;
}

/**
 * A gone business or plan used to answer 200 with the site-wide page, so
 * search engines kept every dead address as a thin duplicate ("soft 404").
 */
const NOT_FOUND: Page = { ...DEFAULT_PAGE(), notFound: true };
function DEFAULT_PAGE(): Page {
  return { title: "Page not found · EverySub", description: "This page is no longer on EverySub.", image: `${SITE}/icon-512.png`, type: "website", h1: "Page not found",
    text: ["This business, plan or page is no longer on EverySub. Browse what is on offer in Roatán instead."],
    lists: [{ heading: "EverySub", links: [{ href: "/discovery", label: "Discover services in Roatán" }] }] };
}

type Lang = "en" | "es";
/** Words the robot page itself says, in both languages. */
const UI = {
  en: { home: "EverySub", businesses: "Businesses", plans: "Plans", vehicles: "Vehicles", questions: "Questions", services: "Services", forBusiness: "For businesses", guides: "Guides", reviews: "Reviews", collections: "Collections" },
  es: { home: "EverySub", businesses: "Negocios", plans: "Planes", vehicles: "Vehículos", questions: "Preguntas frecuentes", services: "Servicios", forBusiness: "Para negocios", guides: "Guías", reviews: "Reseñas", collections: "Colecciones" },
};
/** The address of a page in this language — Spanish only where Spanish exists. */
const hrefIn = (href: string, lang: Lang) => (lang === "es" && isBilingual(href) ? langPath(href, "es") : href);

// `*`: the address in words (slug, public_no) arrives with a backend migration;
// naming the columns before then would fail the whole query.
const PLAN_COLS = "*";
const PUBLIC_PLANS = "status=eq.active&visibility=eq.public&parent_plan_id=is.null";

const ORG = {
  "@context": "https://schema.org", "@type": "Organization", name: "EverySub", url: SITE, logo: `${SITE}/icon-512.png`,
  areaServed: "Roatán, Honduras",
};

function breadcrumbLd(crumbs: Link[]) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${SITE}${c.href}` })),
  };
}

async function servicesList(lang: Lang = "en"): Promise<Link[]> {
  const arch = await rows(`service_archetypes?is_active=eq.true&select=key,label,description&order=sort_order`);
  const links: Link[] = arch.filter((a) => a.key !== "vehicles" && a.key !== "rental")
    .map((a) => {
      const copy = serviceSeo(a.key, lang);
      return { href: hrefIn(`/services/${slugOf(a.key)}`, lang), label: copy?.h1 ?? `${a.label} in Roatán`, note: lang === "es" ? null : clip(a.description, 120) || null };
    });
  const cars = serviceSeo("vehicles", lang)!;
  links.push({ href: hrefIn("/vehicles", lang), label: cars.h1, note: lang === "es" ? "Autos, jeeps y motos por día, semana o mes." : "Cars, jeeps and scooters by the day, week or month." });
  return links;
}

/** Every public plan of these services, cheapest first — the live price list under a guide. */
async function plansOf(keys: string[]): Promise<Link[]> {
  const arch = keys.filter((k) => k !== "vehicles");
  const out: Link[] = [];
  if (arch.length) {
    const provs = await rows(`providers?archetype_key=in.(${arch.join(",")})&status=eq.active&select=id,name`);
    const names = new Map(provs.map((p) => [p.id, p.name]));
    if (provs.length) {
      const plans = await rows(`provider_plans?provider_id=in.(${provs.map((p) => p.id).join(",")})&${PUBLIC_PLANS}&select=${PLAN_COLS}&order=price_cents`);
      plans.forEach((pl) => out.push({ href: planPath(pl), label: `${pl.name} · ${names.get(pl.provider_id) ?? ""}`.replace(/ · $/, ""), note: priceLine(pl.price_cents, pl.period) }));
    }
  }
  if (keys.includes("vehicles")) {
    const cars = await rows(`rental_vehicles?status=eq.public&select=*&order=daily_price_cents`);
    cars.forEach((v) => out.push({ href: carHref(v), label: v.name, note: usd(v.daily_price_cents) ? `${usd(v.daily_price_cents)} / day` : null }));
  }
  return out;
}

/** The first real photo among these businesses — a service's card in a shared link. */
const photoOf = (provs: Array<{ banner_url?: string | null }>) => provs.find((p) => p.banner_url)?.banner_url ?? null;

async function pageFor(path: string, lang: Lang = "en"): Promise<Page | null> {
  const parts = path.split("/").filter(Boolean);
  const ui = UI[lang];

  // ── A business: /businesses/:slug (old: /services/:s/providers/:id, /vehicles/providers/:id) ──
  const provIdx = parts[0] === "businesses" ? 0 : parts.indexOf("providers");
  const provSeg = parts[provIdx + 1] ?? "";
  if (provIdx >= 0 && (UUID.test(provSeg) || SLUG.test(provSeg))) {
    // select=* — `slug` arrives with the provider_slugs migration; naming it
    // before then would fail the whole query.
    const found = await rowsOk(`providers?${UUID.test(provSeg) ? "id" : "slug"}=eq.${provSeg}&select=*`);
    if (!found) return null;
    const [p] = found;
    if (!p || (p.status !== "active" && p.status !== "approved")) return NOT_FOUND;
    const self = providerPath(p) ?? path;
    // A uuid or an old address with the service in it: one 301 to /businesses/<slug>.
    if (self !== path) return { ...DEFAULT, type: "website", redirect: self };
    const reviews = await rows(`provider_reviews?provider_id=eq.${p.id}&hidden_at=is.null&select=rating,comment,customer_name,created_at&order=created_at.desc`);
    // The words of the latest reviews, as the business page shows them.
    const quoted = reviews.filter((r) => clip(r.comment)).slice(0, 5);
    const ratingCount = reviews.length;
    const ratingAvg = ratingCount ? reviews.reduce((s2, r) => s2 + (Number(r.rating) || 0), 0) / ratingCount : 0;
    let offers: Link[] = [];
    const ldOffers: Record<string, unknown>[] = [];
    if (p.unit === "vehicles") {
      const cars = await rows(`rental_vehicles?provider_id=eq.${p.id}&status=eq.public&select=*&order=daily_price_cents`);
      offers = cars.map((v) => ({ href: carHref(v), label: v.name, note: usd(v.daily_price_cents) ? `from ${usd(v.daily_price_cents)} / day` : null }));
      cars.forEach((v) => v.daily_price_cents && ldOffers.push({ "@type": "Offer", name: v.name, price: (v.daily_price_cents / 100).toFixed(2), priceCurrency: "USD", url: `${SITE}${carHref(v)}` }));
    } else if (p.archetype_key) {
      const plans = await rows(`provider_plans?provider_id=eq.${p.id}&${PUBLIC_PLANS}&select=${PLAN_COLS}&order=price_cents`);
      offers = plans.map((pl) => ({ href: planPath(pl, p.archetype_key), label: pl.name, note: priceLine(pl.price_cents, pl.period) }));
      plans.forEach((pl) => pl.price_cents && ldOffers.push({ "@type": "Offer", name: pl.name, price: (pl.price_cents / 100).toFixed(2), priceCurrency: "USD", url: `${SITE}${planPath(pl, p.archetype_key)}` }));
    }
    const section = p.unit === "vehicles" ? { href: "/vehicles", label: "Car rental" } : { href: `/services/${slugOf(p.archetype_key ?? "")}`, label: "Services" };
    const crumbs = [{ href: "/discovery", label: "EverySub" }, section, { href: self, label: p.name }];
    const description = clip(p.description) || `${p.name} on EverySub${p.location ? ` — ${p.location}` : ", Roatán"}.`;
    return {
      title: `${p.name} · EverySub`, description, image: p.banner_url || p.avatar_url || DEFAULT.image, type: "business.business",
      h1: p.name, text: [
        description,
        p.location ? `Location: ${p.location}, Roatán.` : "Roatán, Honduras.",
        ratingCount ? `Rated ${ratingAvg.toFixed(1)} out of 5 from ${ratingCount} review${ratingCount === 1 ? "" : "s"}.` : "",
      ],
      lists: offers.length ? [{ heading: p.unit === "vehicles" ? "Vehicles" : "Plans and offers", links: offers }] : [],
      quotes: quoted.map((r) => ({ who: clip(r.customer_name, 40) || "Customer", rating: Number(r.rating) || null, text: clip(r.comment, 400) })),
      crumbs,
      jsonLd: [{
        "@context": "https://schema.org", "@type": "LocalBusiness", name: p.name, description, url: `${SITE}${self}`,
        image: p.banner_url || p.avatar_url || undefined,
        address: { "@type": "PostalAddress", addressLocality: p.location || "Roatán", addressRegion: "Islas de la Bahía", addressCountry: "HN" },
        ...(p.contact_phone ? { telephone: p.contact_phone } : {}),
        areaServed: { "@type": "Place", name: "Roatán, Islas de la Bahía, Honduras" },
        ...(quoted.length ? { review: quoted.map((r) => ({
          "@type": "Review", reviewBody: clip(r.comment, 500), datePublished: String(r.created_at ?? "").slice(0, 10) || undefined,
          author: { "@type": "Person", name: clip(r.customer_name, 40) || "EverySub customer" },
          ...(r.rating ? { reviewRating: { "@type": "Rating", ratingValue: Number(r.rating), bestRating: 5, worstRating: 1 } } : {}),
        })) } : {}),
        ...(ldOffers.length ? { makesOffer: ldOffers } : {}),
        ...(ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(ratingAvg.toFixed(1)), reviewCount: ratingCount, bestRating: 5, worstRating: 1 } } : {}),
      }, breadcrumbLd(crumbs)],
    };
  }

  // ── An offer: /services/:slug/plans/:id (the id may be the legacy one) ──
  const planIdx = parts.indexOf("plans");
  // /plans/:id now; /services/:slug/plans/:id is the old address (301 below).
  if ((parts[0] === "plans" || parts[0] === "services") && planIdx >= 0 && SAFE_ID.test(parts[planIdx + 1] ?? "")) {
    const id = parts[planIdx + 1];
    const no = publicNoOf(id);
    const byNo = no ? await rowsOk(`provider_plans?public_no=eq.${no}&select=${PLAN_COLS}&limit=1`) : [];
    if (!byNo) return null;
    let [plan] = byNo;
    if (!plan) {
      const filter = UUID.test(id) ? `or=(id.eq.${id},source_plan_id.eq.${id})` : `source_plan_id=eq.${id}`;
      const byId = await rowsOk(`provider_plans?${filter}&select=${PLAN_COLS}&limit=1`);
      if (!byId) return null;
      [plan] = byId;
    }
    if (!plan || plan.status !== "active") return NOT_FOUND;
    // A combination of an offer is the offer: same page, same canonical address.
    if (plan.parent_plan_id) {
      const [parent] = await rows(`provider_plans?id=eq.${plan.parent_plan_id}&select=${PLAN_COLS}&limit=1`);
      if (parent && parent.status === "active") plan = parent;
    }
    const [prov] = plan.provider_id ? await rows(`providers?id=eq.${plan.provider_id}&select=*`) : [];
    const price = priceLine(plan.price_cents, plan.period);
    const description = [price, clip(plan.description, 160)].filter(Boolean).join(" — ") || `${plan.name} on EverySub.`;
    const self = planPath(plan);
    // A uuid, a legacy id or yesterday's words: one 301 to today's address.
    if (self !== path) return { ...DEFAULT, type: "website", redirect: self };
    const provHref = prov ? providerPath(prov) : null;
    const crumbs: Link[] = [{ href: "/discovery", label: "EverySub" }];
    if (prov?.archetype_key) crumbs.push({ href: `/services/${slugOf(prov.archetype_key)}`, label: "Services" });
    if (prov && provHref) crumbs.push({ href: provHref, label: prov.name });
    crumbs.push({ href: self, label: plan.name });
    const image = plan.gallery_urls?.[0] || prov?.banner_url || DEFAULT.image;
    return {
      title: `${plan.name}${prov?.name ? ` · ${prov.name}` : ""}`, description, image, type: "product",
      h1: plan.name,
      text: [price ? `Price: ${price}.` : "", clip(plan.description, 600), prov ? `Offered by ${prov.name} on Roatán. Pay by Lightning, Bitcoin, card or PayPal.` : ""].filter(Boolean),
      lists: provHref ? [{ heading: "More from this business", links: [{ href: provHref, label: prov.name }] }] : [],
      crumbs,
      jsonLd: [{
        "@context": "https://schema.org", "@type": "Product", name: plan.name, description: clip(plan.description, 500) || plan.name, image,
        ...(prov ? { brand: { "@type": "Brand", name: prov.name } } : {}),
        ...(plan.price_cents ? { offers: { "@type": "Offer", price: (plan.price_cents / 100).toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE}${self}` } } : {}),
      }, breadcrumbLd(crumbs)],
    };
  }

  // ── A car: /cars/:id (the old /vehicles/vehicle/:id answers with a 301) ──
  const carSeg = parts[0] === "cars" && parts.length === 2 ? parts[1]
    : parts[0] === "vehicles" && parts[1] === "vehicle" ? (parts[2] ?? "") : null;
  if (carSeg !== null && (UUID.test(carSeg) || publicNoOf(carSeg))) {
    const no = publicNoOf(carSeg);
    const found = await rowsOk(`rental_vehicles?${no ? `public_no=eq.${no}` : `id=eq.${carSeg}`}&select=*`);
    if (!found) return null;
    const [v] = found;
    if (!v || v.status !== "public") return NOT_FOUND;
    const self = carHref(v);
    if (self !== path) return { ...DEFAULT, type: "website", redirect: self };
    const [prov] = v.provider_id ? await rows(`providers?id=eq.${v.provider_id}&select=*`) : [];
    const price = usd(v.daily_price_cents);
    const description = [price ? `From ${price} / day` : null, clip(v.description, 160)].filter(Boolean).join(" — ") || "Rent a car on Roatán with EverySub.";
    const image = v.image_url || v.gallery_urls?.[0] || DEFAULT.image;
    const crumbs: Link[] = [{ href: "/discovery", label: "EverySub" }, { href: "/vehicles", label: "Car rental" }];
    if (prov) crumbs.push({ href: `/businesses/${prov.slug || prov.id}`, label: prov.name });
    crumbs.push({ href: self, label: v.name });
    return {
      title: `${v.name} · Car rental in Roatán`, description, image, type: "product",
      h1: `${v.name} — car rental in Roatán`,
      text: [price ? `From ${price} a day${usd(v.weekly_price_cents) ? `, ${usd(v.weekly_price_cents)} a week` : ""}.` : "", clip(v.description, 600), prov ? `Rented by ${prov.name}.` : ""].filter(Boolean),
      crumbs,
      jsonLd: [{
        "@context": "https://schema.org", "@type": "Product", name: v.name, description: clip(v.description, 500) || v.name, image,
        ...(prov ? { brand: { "@type": "Brand", name: prov.name } } : {}),
        ...(v.daily_price_cents ? { offers: { "@type": "Offer", price: (v.daily_price_cents / 100).toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE}${self}` } } : {}),
      }, breadcrumbLd(crumbs)],
    };
  }

  // ── The fleet: /vehicles ──
  if (parts[0] === "vehicles" && parts.length === 1) {
    const cars = await rows(`rental_vehicles?status=eq.public&select=*&order=daily_price_cents`);
    const copy = serviceSeo("vehicles", lang)!;
    const from = lang === "es" ? "desde" : "from", day = lang === "es" ? "día" : "day";
    return {
      title: `${copy.title} · EverySub`, description: copy.description, image: cars.find((v) => v.image_url)?.image_url || DEFAULT.image, type: "website",
      h1: copy.h1, text: [copy.description],
      lists: [
        { heading: ui.vehicles, links: cars.map((v) => ({ href: carHref(v), label: v.name, note: usd(v.daily_price_cents) ? `${from} ${usd(v.daily_price_cents)} / ${day}` : null })) },
        { heading: ui.guides, links: [{ href: hrefIn("/guides/getting-around-roatan", lang), label: guideBySlug("getting-around-roatan")![lang].title }] },
      ],
      faq: copy.faq,
      crumbs: [{ href: hrefIn("/discovery", lang), label: "EverySub" }, { href: hrefIn("/vehicles", lang), label: copy.h1 }],
      jsonLd: [
        { "@context": "https://schema.org", "@type": "ItemList", itemListElement: cars.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${carHref(v)}`, name: v.name })) },
        faqJsonLd(copy.faq),
      ],
    };
  }

  // ── A service listing: /services/:slug ──
  if (parts[0] === "services" && parts.length === 2) {
    const key = parts[1] === "beach-club" ? "entertainment" : parts[1];
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) return null;
    const [a] = await rows(`service_archetypes?key=eq.${key}&is_active=eq.true&select=label,description`);
    if (!a) return null;
    const provs = await rows(`providers?archetype_key=eq.${key}&status=eq.active&select=*`);
    const ids = provs.map((p) => p.id);
    const plans = ids.length ? await rows(`provider_plans?provider_id=in.(${ids.join(",")})&${PUBLIC_PLANS}&select=${PLAN_COLS}&order=price_cents`) : [];
    const copy = serviceSeo(key, lang);
    const description = copy?.description ?? (clip(a.description) || `${a.label} from local businesses on Roatán — compare plans and subscribe on EverySub.`);
    const guides = GUIDES.filter((g) => g.services.includes(key));
    return {
      title: `${copy?.title ?? `${a.label} in Roatán`} · EverySub`, description, image: photoOf(provs) || DEFAULT.image, type: "website",
      h1: copy?.h1 ?? `${a.label} in Roatán`, text: [description],
      faq: copy?.faq,
      lists: [
        { heading: ui.businesses, links: provs.map((p) => ({ href: providerPath(p)!, label: p.name, note: clip(p.description, 120) || null })) },
        { heading: ui.plans, links: plans.map((pl) => ({ href: planPath(pl, key), label: pl.name, note: priceLine(pl.price_cents, pl.period) })) },
        { heading: ui.guides, links: guides.map((g) => ({ href: hrefIn(`/guides/${g.slug}`, lang), label: g[lang].title })) },
      ].filter((l) => l.links.length),
      crumbs: [{ href: hrefIn("/discovery", lang), label: "EverySub" }, { href: hrefIn(`/services/${parts[1]}`, lang), label: copy?.h1 ?? a.label }],
      jsonLd: [
        { "@context": "https://schema.org", "@type": "ItemList", itemListElement: plans.map((pl, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${planPath(pl, key)}`, name: pl.name })) },
        ...(copy ? [faqJsonLd(copy.faq)] : []),
      ],
    };
  }

  // ── Home ──
  if (parts[0] === "discovery") {
    const provs = await rows(`providers?status=eq.active&select=*&order=name`);
    const es = lang === "es";
    const description = es
      ? "Suscripciones para la vida en Roatán — comida, limpieza, membresías, renta de carros y más de negocios locales. Paga con Lightning, Bitcoin, tarjeta o PayPal."
      : DEFAULT.description;
    return {
      ...DEFAULT, description, image: `${SITE}/for-business/hero.jpg`, type: "website",
      title: es ? "EverySub — Suscripciones y servicios en Roatán" : DEFAULT.title,
      h1: es ? "Suscripciones y servicios en Roatán" : "Subscriptions and services in Roatán",
      text: [description, es
        ? "Negocios locales venden planes de comida, limpieza, membresías, salud y renta de carros en EverySub. Paga por adelantado con Lightning, Bitcoin, tarjeta o PayPal."
        : "Local businesses sell meal plans, cleaning, memberships, healthcare and car rentals on EverySub. Pay up front by Lightning, Bitcoin, card or PayPal."],
      lists: [
        { heading: ui.services, links: await servicesList(lang) },
        { heading: ui.businesses, links: provs.map((p) => ({ href: providerPath(p), label: p.name })).filter((l): l is Link => !!l.href) },
        { heading: ui.guides, links: GUIDES.map((g) => ({ href: hrefIn(`/guides/${g.slug}`, lang), label: g[lang].title })) },
        { heading: ui.forBusiness, links: [{ href: "/for-business", label: es ? "Vende en EverySub" : "Sell on EverySub" }, { href: "/become-a-provider", label: es ? "Solicita vender" : "Apply to sell" }] },
      ],
      jsonLd: [ORG, { "@context": "https://schema.org", "@type": "WebSite", name: "EverySub", url: SITE, inLanguage: lang }],
    };
  }

  // ── Guides: /guides and /guides/:slug ──
  if (parts[0] === "guides" && parts.length <= 2) {
    const idx = GUIDES_INDEX[lang];
    const home = { href: hrefIn("/discovery", lang), label: "EverySub" };
    const index = { href: hrefIn("/guides", lang), label: ui.guides };
    if (parts.length === 1) {
      return {
        title: `${idx.title} · EverySub`, description: idx.description, image: `${SITE}/for-business/hero.jpg`, type: "website",
        h1: idx.h1, text: [idx.intro],
        lists: [{ heading: ui.guides, links: GUIDES.map((g) => ({ href: hrefIn(`/guides/${g.slug}`, lang), label: g[lang].title, note: g[lang].description })) }],
        crumbs: [home, index],
        jsonLd: [{ "@context": "https://schema.org", "@type": "ItemList", itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${hrefIn(`/guides/${g.slug}`, lang)}`, name: g[lang].title })) }],
      };
    }
    const g = guideBySlug(parts[1]);
    if (!g) return null;
    const t = g[lang];
    const self = hrefIn(`/guides/${g.slug}`, lang);
    const crumbs = [home, index, { href: self, label: t.h1 }];
    const ex = guideExtras(g.slug, lang);
    return {
      title: `${t.title} · EverySub`, description: t.description, image: `${SITE}/for-business/hero.jpg`, type: "article",
      h1: t.h1, text: [t.intro],
      sections: [
        ...(ex ? [{ h: lang === "es" ? "En resumen" : "In short", p: ex.takeaways }] : []),
        ...t.sections,
      ],
      faq: ex?.faq,
      lists: [
        { heading: idx.more, links: await plansOf(g.services) },
        { heading: idx.all, links: GUIDES.filter((x) => x.slug !== g.slug).map((x) => ({ href: hrefIn(`/guides/${x.slug}`, lang), label: x[lang].title })) },
      ].filter((l) => l.links.length),
      crumbs,
      jsonLd: [{
        "@context": "https://schema.org", "@type": "Article", headline: t.h1, description: t.description, inLanguage: lang,
        dateModified: g.updated, datePublished: g.updated, mainEntityOfPage: `${SITE}${self}`,
        image: `${SITE}/for-business/hero.jpg`, author: { "@type": "Organization", name: "EverySub", url: SITE }, publisher: ORG,
      }, breadcrumbLd(crumbs), ...(ex ? [faqJsonLd(ex.faq)] : [])],
    };
  }

  // ── Collections: /collections and /collections/:slug ──
  if (parts[0] === "collections" && parts.length <= 2) {
    const colsOk = await rowsOk(`home_collections?is_active=eq.true&select=*,home_collection_plans(plan_id,sort_order)&order=sort_order`);
    if (!colsOk) return null;
    const cols = colsOk;
    const href = (c: { slug?: string | null; id: string }) => `/collections/${c.slug || c.id}`;
    const home = { href: "/discovery", label: "EverySub" }, index = { href: "/collections", label: "Collections" };
    if (parts.length === 1) {
      const description = "Hand-picked subscriptions on EverySub, Roatán: popular plans, ideas for families, date nights and more.";
      return {
        title: "Collections · EverySub", description, image: cols.find((c) => c.cover_url)?.cover_url || DEFAULT.image, type: "website",
        h1: "Collections", text: [description],
        lists: [{ heading: "Collections", links: cols.map((c) => ({ href: href(c), label: c.title, note: clip(c.subtitle || c.description, 140) || null })) }],
        crumbs: [home, index],
        jsonLd: [{ "@context": "https://schema.org", "@type": "ItemList", itemListElement: cols.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${href(c)}`, name: c.title })) }],
      };
    }
    const c = cols.find((x) => x.slug === parts[1]) ?? cols.find((x) => x.id === parts[1]);
    if (!c) return NOT_FOUND;
    if (href(c) !== path) return { ...DEFAULT, type: "website", redirect: href(c) };
    const ids = [...(c.home_collection_plans ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order).map((x: any) => x.plan_id);
    const plans = ids.length ? await rows(`provider_plans?id=in.(${ids.join(",")})&${PUBLIC_PLANS}&select=${PLAN_COLS}`) : [];
    const ordered = ids.map((id: string) => plans.find((pl) => pl.id === id)).filter(Boolean) as any[];
    const description = clip(c.description || c.subtitle) || `${c.title} — hand-picked subscriptions on EverySub, Roatán.`;
    const crumbs = [home, index, { href: href(c), label: c.title }];
    return {
      title: `${c.title} · EverySub`, description, image: c.cover_url || ordered.find((pl) => pl.gallery_urls?.[0])?.gallery_urls?.[0] || DEFAULT.image, type: "website",
      h1: c.title, text: [description],
      lists: [{ heading: "Plans", links: ordered.map((pl) => ({ href: planPath(pl), label: pl.name, note: priceLine(pl.price_cents, pl.period) })) }],
      crumbs,
      jsonLd: [{ "@context": "https://schema.org", "@type": "ItemList", name: c.title, itemListElement: ordered.map((pl, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${planPath(pl)}`, name: pl.name })) }, breadcrumbLd(crumbs)],
    };
  }

  // ── The page sent to businesses ──
  if (parts[0] === "for-business") {
    const description = "Your own page, payment up front by Lightning, Bitcoin, card or PayPal, and your money whenever you want it. No monthly fee; 0% on customers you bring.";
    return {
      title: "Sell subscriptions and bookings in Roatán · EverySub", description,
      image: `${SITE}/for-business/hero.jpg`, type: "website",
      h1: "Sell subscriptions and bookings in Roatán",
      text: [description, "Your own page and checkout, a schedule with Google Calendar, team access, promo codes, messages to subscribers and withdrawals to a Lightning or Bitcoin address."],
      lists: [{ heading: "Get started", links: [{ href: "/become-a-provider", label: "Apply to sell — about 5 minutes" }] }],
      jsonLd: [ORG],
    };
  }

  if (parts[0] === "how-it-works") {
    const description = "Pick a local service on Roatán, choose your options, pay up front by Lightning, Bitcoin, card or PayPal — then meals, cleaning, memberships and rentals just happen.";
    return {
      title: "How EverySub works — subscriptions and bookings on Roatán", description, image: `${SITE}/for-business/hero.jpg`, type: "website",
      h1: "Subscribe once, it shows up every week",
      text: [description, "1. Pick a service. 2. Choose what fits. 3. Pay up front. 4. It just happens — deliveries, visits and bookings on schedule, all in one account with reminders and an access QR."],
      lists: [{ heading: "Start", links: await servicesList() }],
    };
  }

  if (parts[0] === "pay-with-bitcoin") {
    const provs = await rows(`providers?status=eq.active&select=*&order=name`);
    const description = "Pay Roatán businesses with Bitcoin: Lightning in seconds, on-chain Bitcoin, or card and PayPal. Every business on EverySub accepts all of them.";
    return {
      title: "Pay with Bitcoin in Roatán — Lightning, on-chain, card", description, image: `${SITE}/for-business/hero.jpg`, type: "website",
      h1: "Pay with Bitcoin, all over Roatán",
      text: [description, "Choose a plan, pick Lightning at checkout, scan the QR with any Lightning wallet (Blink, Wallet of Satoshi, Phoenix, Strike…) and it confirms in seconds."],
      lists: [{
        heading: "Businesses in Roatán that accept Bitcoin",
        links: provs.map((p) => ({ href: providerPath(p), label: p.name, note: p.location || null })).filter((l): l is Link => !!l.href),
      }],
      jsonLd: [{ "@context": "https://schema.org", "@type": "ItemList", name: "Businesses in Roatán that accept Bitcoin",
        itemListElement: provs.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${SITE}${providerPath(p) ?? "/discovery"}` })) }],
    };
  }

  if (parts[0] === "about") {
    const description = "EverySub is a marketplace for subscriptions, bookings and rentals from local businesses on Roatán, Honduras — paid up front by Lightning, Bitcoin, card or PayPal.";
    return {
      title: "About EverySub — local services on Roatán", description, image: `${SITE}/for-business/hero.jpg`, type: "website",
      h1: "About EverySub", text: [description, "Contact: WhatsApp +504 9706-7865 · support@prosperasub.com · Roatán, Islas de la Bahía, Honduras."],
      lists: [{ heading: "More", links: [{ href: "/how-it-works", label: "How it works" }, { href: "/pay-with-bitcoin", label: "Pay with Bitcoin" }, { href: "/for-business", label: "For businesses" }] }],
      jsonLd: [ORG],
    };
  }

  if (parts[0] === "terms" || parts[0] === "privacy") {
    const terms = parts[0] === "terms";
    const description = terms
      ? "These terms apply when you use EverySub — the website and app at everysub.net — to find, buy and manage services in Roatán."
      : "What EverySub collects when you use everysub.net, why, who it is shared with, and what you can ask us to do with it.";
    const headings = terms
      ? ["What EverySub is", "Your account", "Buying a plan or a booking", "Payments", "Changing, pausing and cancelling", "Refunds", "Providers", "Featured places and ads", "Reviews and what you post", "Fair use", "Liability", "Changes to these terms"]
      : ["What we collect", "How we use it", "Who we share it with", "Cookies and storage on your device", "How long we keep it", "Your choices and rights", "Security", "Children", "Changes to this policy"];
    const title = terms ? "Terms of Service" : "Privacy Policy";
    return {
      title: `${title} · EverySub`, description, image: DEFAULT.image, type: "website",
      h1: title, text: [description],
      sections: [{ h: "Contents", p: headings }],
      lists: [{ heading: "More", links: [terms ? { href: "/privacy", label: "Privacy Policy" } : { href: "/terms", label: "Terms of Service" }, { href: "/support", label: "Support" }] }],
    };
  }

  if (parts[0] === "support" && parts.length === 1) {
    const description = "Questions about an order, a payment or a business on EverySub? Write to us on WhatsApp or by email.";
    return {
      title: "Support · EverySub", description, image: DEFAULT.image, type: "website",
      h1: "How can we help?", text: [description],
      lists: [{ heading: "More", links: [{ href: "/how-it-works", label: "How it works" }, { href: "/terms", label: "Terms of Service" }, { href: "/privacy", label: "Privacy Policy" }] }],
    };
  }

  if (parts[0] === "become-a-provider") {
    const description = "Apply to put your Roatán business on EverySub — subscriptions, bookings and rentals, paid up front. No setup or monthly fee.";
    return {
      title: "Apply to sell on EverySub", description, image: `${SITE}/for-business/hero.jpg`, type: "website",
      h1: "Apply to sell on EverySub", text: [description],
      lists: [{ heading: "Learn more", links: [{ href: "/for-business", label: "How selling on EverySub works" }] }],
    };
  }
  return null;
}

function html(path: string, lang: Lang, p: Page, popular: PopularGroup[] = []) {
  const url = `${SITE}${langPath(path, lang)}`;
  const t = esc(p.title), d = esc(p.description), i = esc(p.image), u = esc(url);
  const ui = UI[lang];
  // Each language names the other; x-default is the English page.
  const alt = isBilingual(path)
    ? ["en", "es"].map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(SITE + langPath(path, l as Lang))}">`).join("\n")
      + `\n<link rel="alternate" hreflang="x-default" href="${esc(SITE + path)}">`
    : "";
  const a = (l: Link) => `<a href="${esc(SITE + l.href)}">${esc(l.label)}</a>${l.note ? ` — ${esc(l.note)}` : ""}`;
  const crumbs = p.crumbs?.length ? `<nav aria-label="Breadcrumb">${p.crumbs.map(a).join(" › ")}</nav>` : "";
  const text = (p.text ?? []).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("")
    + (p.sections ?? []).map((s2) => `<h2>${esc(s2.h)}</h2>${s2.p.map((x) => `<p>${esc(x)}</p>`).join("")}`).join("")
    + (p.quotes?.length ? `<h2>${ui.reviews}</h2>${p.quotes.map((q) => `<blockquote><p>${esc(q.text)}</p><footer>${esc(q.who)}${q.rating ? ` · ${q.rating}/5` : ""}</footer></blockquote>`).join("")}` : "");
  const lists = (p.lists ?? []).map((l) => `<h2>${esc(l.heading)}</h2><ul>${l.links.map((x) => `<li>${a(x)}</li>`).join("")}</ul>`).join("")
    + (p.faq?.length ? `<h2>${ui.questions}</h2>${p.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}` : "")
    // The "Popular" chips the app shows above its footer — the same rows (src/lib/seo/popular.ts).
    + (popular.length ? `<section><h2>${esc(popularText(lang).title)}</h2>${popular.map((g) => `<h3>${esc(g.heading)}</h3><ul>${g.links.map((x) => `<li>${a({ ...x, href: hrefIn(x.href, lang) })}</li>`).join("")}</ul>`).join("")}</section>` : "");
  const ld = (p.jsonLd ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
${p.notFound ? `<meta name="robots" content="noindex">` : `<link rel="canonical" href="${u}">\n${alt}`}
<meta property="og:site_name" content="EverySub">
<meta property="og:type" content="${p.type}">
<meta property="og:locale" content="${lang === "es" ? "es_HN" : "en_US"}">
<meta property="og:url" content="${u}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${i}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
${ld}
</head><body>${crumbs}<main><h1>${esc(p.h1 ?? p.title)}</h1>${text}${lists}</main>
<footer><a href="${SITE}${hrefIn("/discovery", lang)}">EverySub</a> · <a href="${SITE}${hrefIn("/guides", lang)}">${ui.guides}</a> · <a href="${SITE}/collections">${ui.collections}</a> · <a href="${SITE}/for-business">${ui.forBusiness}</a> · <a href="${SITE}/terms">Terms</a> · <a href="${SITE}/privacy">Privacy</a>${isBilingual(path) ? ` · <a href="${SITE}${langPath(path, lang === "es" ? "en" : "es")}" hreflang="${lang === "es" ? "en" : "es"}">${lang === "es" ? "English" : "Español"}</a>` : ""}</footer>
</body></html>`;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);

  // The bare domain is the home page — say so with a 301, for people and robots.
  if (url.pathname === "/" || url.pathname === "/es" || url.pathname === "/es/") {
    return Response.redirect(`${url.origin}${url.pathname.startsWith("/es") ? "/es" : ""}/discovery${url.search}`, 301);
  }

  const ua = request.headers.get("user-agent") ?? "";
  const forced = url.searchParams.get("_og") === "1";
  if (!forced && !PREVIEW_BOT.test(ua) && !SEARCH_BOT.test(ua)) return pass();
  try {
    const { lang, path } = splitLang(url.pathname);
    // Spanish exists only for the bilingual pages; the app serves the rest.
    if (lang === "es" && !isBilingual(path)) return pass();
    const page = await pageFor(path, lang);
    if (!page) return pass();
    if (page.redirect) return Response.redirect(`${SITE}${langPath(page.redirect, lang)}`, 301);
    const popular = page.notFound ? [] : await popularFor(path, lang, rows).catch(() => []);
    return new Response(html(path, lang, page, popular), {
      status: page.notFound ? 404 : 200,
      headers: {
        ...(page.notFound ? { "x-robots-tag": "noindex" } : {}),
        "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600", vary: "user-agent",
        // dev.everysub.net and preview deployments are copies: keep them out of the index.
        ...(url.hostname === "everysub.net" ? {} : { "x-robots-tag": "noindex, nofollow" }),
      },
    });
  } catch {
    return pass();
  }
}
