/**
 * Link previews for the apps that don't run JavaScript.
 *
 * WhatsApp, Facebook, Telegram, X, Slack and friends fetch a shared URL and
 * read the Open Graph tags in the raw HTML. This is a single-page app, so every
 * URL used to answer with index.html's site-wide card — a link to a restaurant
 * or a plan previewed as "EverySub — Subscriptions in Roatán". For those bots
 * only, this Vercel Routing Middleware answers with a tiny HTML page carrying
 * the real title, description and photo of the business, plan or car.
 *
 * Everyone else (and Googlebot, which renders the app and reads useSeo) passes
 * straight through. Data comes from the same public rows the app shows, with
 * the public anon key. Any failure falls through to the normal page.
 *
 * `?_og=1` forces the bot path, for checking a preview from a browser.
 */
export const config = {
  matcher: ["/services/:path*", "/vehicles/:path*", "/discovery", "/for-business"],
};

const BOT = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Pinterest|SkypeUriPreview|vkShare|redditbot|Embedly|Iframely|bitlybot|Applebot/i;

const SITE = "https://everysub.net";
const SUPABASE_URL = "https://igbytraidldkhhamsfdo.supabase.co";
// The public anon key — the same one every browser already receives in the bundle.
const ANON = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYnl0cmFpZGxka2hoYW1zZmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQxMzEsImV4cCI6MjA5NTU3MDEzMX0.VbaT7LMvtwswdfyDZI1rWkZtKSC0ICBDHeVbO4hLJeI";

const DEFAULT = {
  title: "EverySub — Subscriptions in Roatán",
  description: "Subscriptions for life on Roatán — meals, cleaning, memberships, vehicles and more, paid in Bitcoin, by card or PayPal.",
  image: `${SITE}/icon-512.png`,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[0-9a-zA-Z-]{1,64}$/;

const pass = () => new Response(null, { headers: { "x-middleware-next": "1" } });

async function rows<T>(path: string): Promise<T[]> {
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
const PERIOD: Record<string, string> = { week: "week", weekly: "week", month: "month", monthly: "month", year: "year", yearly: "year", one_time: "" };

interface Card { title: string; description: string; image: string; type: "website" | "product" | "business.business" }

async function cardFor(path: string): Promise<Card | null> {
  const parts = path.split("/").filter(Boolean);

  // /services/:slug/providers/:id  ·  /vehicles/providers/:id
  const provIdx = parts.indexOf("providers");
  if (provIdx >= 0 && UUID.test(parts[provIdx + 1] ?? "")) {
    const [p] = await rows<any>(`providers?id=eq.${parts[provIdx + 1]}&select=name,description,banner_url,avatar_url,location`);
    if (!p) return null;
    return {
      title: `${p.name} · EverySub`,
      description: clip(p.description) || `${p.name} on EverySub${p.location ? ` — ${p.location}` : ", Roatán"}.`,
      image: p.banner_url || p.avatar_url || DEFAULT.image,
      type: "business.business",
    };
  }

  // /services/:slug/plans/:id  (the id may be the legacy one)
  const planIdx = parts.indexOf("plans");
  if (parts[0] === "services" && planIdx >= 0 && SAFE_ID.test(parts[planIdx + 1] ?? "")) {
    const id = parts[planIdx + 1];
    const filter = UUID.test(id) ? `or=(id.eq.${id},source_plan_id.eq.${id})` : `source_plan_id=eq.${id}`;
    const [plan] = await rows<any>(`provider_plans?${filter}&select=name,description,price_cents,period,gallery_urls,provider_id&limit=1`);
    if (!plan) return null;
    const [prov] = plan.provider_id ? await rows<any>(`providers?id=eq.${plan.provider_id}&select=name,banner_url`) : [];
    const price = usd(plan.price_cents);
    const per = PERIOD[String(plan.period ?? "")] ?? "";
    return {
      title: `${plan.name}${prov?.name ? ` · ${prov.name}` : ""}`,
      description: [price ? `${price}${per ? ` / ${per}` : ""}` : null, clip(plan.description, 160)].filter(Boolean).join(" — ")
        || `${plan.name} on EverySub.`,
      image: plan.gallery_urls?.[0] || prov?.banner_url || DEFAULT.image,
      type: "product",
    };
  }

  // /vehicles/vehicle/:id
  if (parts[0] === "vehicles" && parts[1] === "vehicle" && UUID.test(parts[2] ?? "")) {
    const [v] = await rows<any>(`rental_vehicles?id=eq.${parts[2]}&select=name,description,daily_price_cents,image_url,gallery_urls`);
    if (!v) return null;
    const price = usd(v.daily_price_cents);
    return {
      title: `${v.name} · Car rental in Roatán`,
      description: [price ? `From ${price} / day` : null, clip(v.description, 160)].filter(Boolean).join(" — ") || "Rent a car on Roatán with EverySub.",
      image: v.image_url || v.gallery_urls?.[0] || DEFAULT.image,
      type: "product",
    };
  }

  // /vehicles
  if (parts[0] === "vehicles" && parts.length === 1) {
    return { title: "Car rental in Roatán · EverySub", description: "Cars, jeeps and scooters from local rental companies — by the day, week or month.", image: DEFAULT.image, type: "website" };
  }

  // /services/:slug — a service listing
  if (parts[0] === "services" && parts.length === 2) {
    const key = parts[1] === "beach-club" ? "entertainment" : parts[1];
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) return null;
    const [a] = await rows<any>(`service_archetypes?key=eq.${key}&select=label,description`);
    if (!a) return null;
    return {
      title: `${a.label} in Roatán · EverySub`,
      description: clip(a.description) || `${a.label} from local businesses on Roatán — compare plans and subscribe on EverySub.`,
      image: DEFAULT.image,
      type: "website",
    };
  }

  if (parts[0] === "discovery") return { ...DEFAULT, type: "website" };
  // The page sent to businesses — its preview is the pitch.
  if (parts[0] === "for-business") {
    return {
      title: "Sell subscriptions and bookings in Roatán · EverySub",
      description: "Your own page, payment up front by Lightning, Bitcoin or PayPal, and your money whenever you want it. No monthly fee; 0% on customers you bring.",
      image: "https://everysub.net/for-business/hero.jpg", type: "website",
    };
  }
  return null;
}

function html(url: string, c: Card) {
  const t = esc(c.title), d = esc(c.description), i = esc(c.image), u = esc(url);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="EverySub">
<meta property="og:type" content="${c.type}">
<meta property="og:url" content="${u}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${i}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
</head><body><h1>${t}</h1><p>${d}</p><p><a href="${u}">${u}</a></p></body></html>`;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const forced = url.searchParams.get("_og") === "1";
  if (!forced && !BOT.test(request.headers.get("user-agent") ?? "")) return pass();
  try {
    const card = await cardFor(url.pathname);
    if (!card) return pass();
    const canonical = `${SITE}${url.pathname}`;
    return new Response(html(canonical, card), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600" },
    });
  } catch {
    return pass();
  }
}
