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
 */
export const config = {
  matcher: ["/", "/services/:path*", "/vehicles/:path*", "/discovery", "/for-business", "/become-a-provider"],
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
const SAFE_ID = /^[0-9a-zA-Z-]{1,64}$/;

const pass = () => new Response(null, { headers: { "x-middleware-next": "1" } });

async function rows<T = any>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) return [];
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
/** The URL segment a service uses (src/lib/services/serviceUrls.ts KEY_TO_SLUG). */
const slugOf = (key: string) => (key === "entertainment" ? "beach-club" : key);
const providerPath = (p: { id: string; unit?: string | null; archetype_key?: string | null }) =>
  p.unit === "vehicles" ? `/vehicles/providers/${p.id}` : p.archetype_key ? `/services/${slugOf(p.archetype_key)}/providers/${p.id}` : null;
const planPath = (plan: { id: string; source_plan_id?: string | null }, archetype: string) =>
  `/services/${slugOf(archetype)}/plans/${plan.source_plan_id || plan.id}`;

interface Link { href: string; label: string; note?: string | null }
interface Page {
  title: string;
  description: string;
  image: string;
  type: "website" | "product" | "business.business";
  h1?: string;
  /** Plain paragraphs under the H1. */
  text?: string[];
  /** Named lists of links — the offers, the businesses, the services. */
  lists?: Array<{ heading: string; links: Link[] }>;
  crumbs?: Link[];
  jsonLd?: Record<string, unknown>[];
}

const PLAN_COLS = "id,name,description,price_cents,period,source_plan_id,gallery_urls,provider_id";
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

async function servicesList(): Promise<Link[]> {
  const arch = await rows(`service_archetypes?is_active=eq.true&select=key,label,description&order=sort_order`);
  const links: Link[] = arch.filter((a) => a.key !== "vehicles" && a.key !== "rental")
    .map((a) => ({ href: `/services/${slugOf(a.key)}`, label: `${a.label} in Roatán`, note: clip(a.description, 120) || null }));
  links.push({ href: "/vehicles", label: "Car rental in Roatán", note: "Cars, jeeps and scooters by the day, week or month." });
  return links;
}

async function pageFor(path: string): Promise<Page | null> {
  const parts = path.split("/").filter(Boolean);

  // ── A business: /services/:slug/providers/:id · /vehicles/providers/:id ──
  const provIdx = parts.indexOf("providers");
  if (provIdx >= 0 && UUID.test(parts[provIdx + 1] ?? "")) {
    const [p] = await rows(`providers?id=eq.${parts[provIdx + 1]}&select=id,name,description,banner_url,avatar_url,location,unit,archetype_key,contact_phone,status`);
    if (!p || (p.status !== "active" && p.status !== "approved")) return null;
    const self = providerPath(p) ?? path;
    let offers: Link[] = [];
    const ldOffers: Record<string, unknown>[] = [];
    if (p.unit === "vehicles") {
      const cars = await rows(`rental_vehicles?provider_id=eq.${p.id}&status=eq.public&select=id,name,daily_price_cents&order=daily_price_cents`);
      offers = cars.map((v) => ({ href: `/vehicles/vehicle/${v.id}`, label: v.name, note: usd(v.daily_price_cents) ? `from ${usd(v.daily_price_cents)} / day` : null }));
      cars.forEach((v) => v.daily_price_cents && ldOffers.push({ "@type": "Offer", name: v.name, price: (v.daily_price_cents / 100).toFixed(2), priceCurrency: "USD", url: `${SITE}/vehicles/vehicle/${v.id}` }));
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
      h1: p.name, text: [description, p.location ? `Location: ${p.location}, Roatán.` : "Roatán, Honduras."],
      lists: offers.length ? [{ heading: p.unit === "vehicles" ? "Vehicles" : "Plans and offers", links: offers }] : [],
      crumbs,
      jsonLd: [{
        "@context": "https://schema.org", "@type": "LocalBusiness", name: p.name, description, url: `${SITE}${self}`,
        image: p.banner_url || p.avatar_url || undefined,
        address: { "@type": "PostalAddress", addressLocality: p.location || "Roatán", addressRegion: "Islas de la Bahía", addressCountry: "HN" },
        ...(ldOffers.length ? { makesOffer: ldOffers } : {}),
      }, breadcrumbLd(crumbs)],
    };
  }

  // ── An offer: /services/:slug/plans/:id (the id may be the legacy one) ──
  const planIdx = parts.indexOf("plans");
  if (parts[0] === "services" && planIdx >= 0 && SAFE_ID.test(parts[planIdx + 1] ?? "")) {
    const id = parts[planIdx + 1];
    const filter = UUID.test(id) ? `or=(id.eq.${id},source_plan_id.eq.${id})` : `source_plan_id=eq.${id}`;
    const [plan] = await rows(`provider_plans?${filter}&select=${PLAN_COLS},status&limit=1`);
    if (!plan || plan.status !== "active") return null;
    const [prov] = plan.provider_id ? await rows(`providers?id=eq.${plan.provider_id}&select=id,name,banner_url,unit,archetype_key`) : [];
    const price = priceLine(plan.price_cents, plan.period);
    const description = [price, clip(plan.description, 160)].filter(Boolean).join(" — ") || `${plan.name} on EverySub.`;
    const self = prov?.archetype_key ? planPath(plan, prov.archetype_key) : path;
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

  // ── A car: /vehicles/vehicle/:id ──
  if (parts[0] === "vehicles" && parts[1] === "vehicle" && UUID.test(parts[2] ?? "")) {
    const [v] = await rows(`rental_vehicles?id=eq.${parts[2]}&select=id,name,description,daily_price_cents,weekly_price_cents,image_url,gallery_urls,provider_id,status`);
    if (!v || v.status !== "public") return null;
    const [prov] = v.provider_id ? await rows(`providers?id=eq.${v.provider_id}&select=id,name,unit`) : [];
    const price = usd(v.daily_price_cents);
    const description = [price ? `From ${price} / day` : null, clip(v.description, 160)].filter(Boolean).join(" — ") || "Rent a car on Roatán with EverySub.";
    const image = v.image_url || v.gallery_urls?.[0] || DEFAULT.image;
    const crumbs: Link[] = [{ href: "/discovery", label: "EverySub" }, { href: "/vehicles", label: "Car rental" }];
    if (prov) crumbs.push({ href: `/vehicles/providers/${prov.id}`, label: prov.name });
    crumbs.push({ href: `/vehicles/vehicle/${v.id}`, label: v.name });
    return {
      title: `${v.name} · Car rental in Roatán`, description, image, type: "product",
      h1: `${v.name} — car rental in Roatán`,
      text: [price ? `From ${price} a day${usd(v.weekly_price_cents) ? `, ${usd(v.weekly_price_cents)} a week` : ""}.` : "", clip(v.description, 600), prov ? `Rented by ${prov.name}.` : ""].filter(Boolean),
      crumbs,
      jsonLd: [{
        "@context": "https://schema.org", "@type": "Product", name: v.name, description: clip(v.description, 500) || v.name, image,
        ...(prov ? { brand: { "@type": "Brand", name: prov.name } } : {}),
        ...(v.daily_price_cents ? { offers: { "@type": "Offer", price: (v.daily_price_cents / 100).toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE}/vehicles/vehicle/${v.id}` } } : {}),
      }, breadcrumbLd(crumbs)],
    };
  }

  // ── The fleet: /vehicles ──
  if (parts[0] === "vehicles" && parts.length === 1) {
    const cars = await rows(`rental_vehicles?status=eq.public&select=id,name,daily_price_cents&order=daily_price_cents`);
    const description = "Cars, jeeps and scooters from local rental companies on Roatán — by the day, week or month, delivered or picked up.";
    return {
      title: "Car rental in Roatán · EverySub", description, image: DEFAULT.image, type: "website",
      h1: "Car rental in Roatán", text: [description],
      lists: [{ heading: "Vehicles", links: cars.map((v) => ({ href: `/vehicles/vehicle/${v.id}`, label: v.name, note: usd(v.daily_price_cents) ? `from ${usd(v.daily_price_cents)} / day` : null })) }],
      crumbs: [{ href: "/discovery", label: "EverySub" }, { href: "/vehicles", label: "Car rental" }],
      jsonLd: [{ "@context": "https://schema.org", "@type": "ItemList", itemListElement: cars.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/vehicles/vehicle/${v.id}`, name: v.name })) }],
    };
  }

  // ── A service listing: /services/:slug ──
  if (parts[0] === "services" && parts.length === 2) {
    const key = parts[1] === "beach-club" ? "entertainment" : parts[1];
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) return null;
    const [a] = await rows(`service_archetypes?key=eq.${key}&is_active=eq.true&select=label,description`);
    if (!a) return null;
    const provs = await rows(`providers?archetype_key=eq.${key}&status=eq.active&select=id,name,unit,archetype_key,description`);
    const ids = provs.map((p) => p.id);
    const plans = ids.length ? await rows(`provider_plans?provider_id=in.(${ids.join(",")})&${PUBLIC_PLANS}&select=${PLAN_COLS}&order=price_cents`) : [];
    const description = clip(a.description) || `${a.label} from local businesses on Roatán — compare plans and subscribe on EverySub.`;
    return {
      title: `${a.label} in Roatán · EverySub`, description, image: DEFAULT.image, type: "website",
      h1: `${a.label} in Roatán`, text: [description],
      lists: [
        { heading: "Businesses", links: provs.map((p) => ({ href: providerPath(p)!, label: p.name, note: clip(p.description, 120) || null })) },
        { heading: "Plans", links: plans.map((pl) => ({ href: planPath(pl, key), label: pl.name, note: priceLine(pl.price_cents, pl.period) })) },
      ].filter((l) => l.links.length),
      crumbs: [{ href: "/discovery", label: "EverySub" }, { href: `/services/${parts[1]}`, label: a.label }],
      jsonLd: [{ "@context": "https://schema.org", "@type": "ItemList", itemListElement: plans.map((pl, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${planPath(pl, key)}`, name: pl.name })) }],
    };
  }

  // ── Home ──
  if (parts[0] === "discovery") {
    const provs = await rows(`providers?status=eq.active&select=id,name,unit,archetype_key&order=name`);
    return {
      ...DEFAULT, type: "website",
      h1: "Subscriptions and services in Roatán",
      text: [DEFAULT.description, "Local businesses sell meal plans, cleaning, memberships, healthcare and car rentals on EverySub. Pay up front by Lightning, Bitcoin, card or PayPal."],
      lists: [
        { heading: "Services", links: await servicesList() },
        { heading: "Businesses", links: provs.map((p) => ({ href: providerPath(p), label: p.name })).filter((l): l is Link => !!l.href) },
        { heading: "For businesses", links: [{ href: "/for-business", label: "Sell on EverySub" }, { href: "/become-a-provider", label: "Apply to sell" }] },
      ],
      jsonLd: [ORG, { "@context": "https://schema.org", "@type": "WebSite", name: "EverySub", url: SITE }],
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

function html(url: string, p: Page) {
  const t = esc(p.title), d = esc(p.description), i = esc(p.image), u = esc(url);
  const a = (l: Link) => `<a href="${esc(SITE + l.href)}">${esc(l.label)}</a>${l.note ? ` — ${esc(l.note)}` : ""}`;
  const crumbs = p.crumbs?.length ? `<nav aria-label="Breadcrumb">${p.crumbs.map(a).join(" › ")}</nav>` : "";
  const text = (p.text ?? []).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("");
  const lists = (p.lists ?? []).map((l) => `<h2>${esc(l.heading)}</h2><ul>${l.links.map((x) => `<li>${a(x)}</li>`).join("")}</ul>`).join("");
  const ld = (p.jsonLd ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="EverySub">
<meta property="og:type" content="${p.type}">
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
<footer><a href="${SITE}/discovery">EverySub</a> · <a href="${SITE}/for-business">For businesses</a> · <a href="${SITE}/terms">Terms</a> · <a href="${SITE}/privacy">Privacy</a></footer>
</body></html>`;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);

  // The bare domain is the home page — say so with a 301, for people and robots.
  if (url.pathname === "/") {
    return Response.redirect(`${url.origin}/discovery${url.search}`, 301);
  }

  const ua = request.headers.get("user-agent") ?? "";
  const forced = url.searchParams.get("_og") === "1";
  if (!forced && !PREVIEW_BOT.test(ua) && !SEARCH_BOT.test(ua)) return pass();
  try {
    const page = await pageFor(url.pathname);
    if (!page) return pass();
    return new Response(html(`${SITE}${url.pathname}`, page), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600", vary: "user-agent" },
    });
  } catch {
    return pass();
  }
}
