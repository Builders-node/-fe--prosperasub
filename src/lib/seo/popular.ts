/**
 * The "Popular" block above the site footer: rows of link chips that change
 * with the page — the way big marketplaces end a page with "popular brands in
 * this category" and "top searches".
 *
 *   a service page   → popular businesses in it, its most-bought plans
 *   a plan, a car,   → similar plans, other businesses in the same service,
 *   a business         the neighbouring services
 *   home, guides,    → top services, collections, guides
 *   collections
 *
 * Why it exists: every chip is an ordinary <a href> to a page that already
 * exists, so a crawler that lands on any page finds the rest of the shop in
 * one hop, with words in the anchor text. Nothing here makes a page: there are
 * no "tag" addresses, only businesses, plans, cars, services, collections and
 * guides that are already on the site. A service with nothing on sale is left
 * out (it is an empty page), and so is anything not public.
 *
 * Everything is read from the database each time, so a new business or plan
 * appears in the block with no code. "Most bought" comes from the
 * `popular_plans()` function (backend migration 20261212120000) — a rank, never
 * a count. Before that function exists the block still works: the plans are
 * ordered by the shop's own sort order, then by price.
 *
 * The app (src/components/seo/PopularLinks.tsx) and the robot pages
 * (middleware.ts) both call `popularFor`, each with its own way of reading
 * rows, so a person and a crawler get the same links. Only relative imports of
 * import-free files, so the edge middleware can bundle it.
 */
import { GUIDES } from "./guides";
import { serviceSeo } from "./serviceSeo";

export type PopularLang = "en" | "es";

/** Reads PostgREST rows: `rows("providers?status=eq.active&select=*")`. An error is []. */
export type RowReader = (path: string) => Promise<any[]>;

export interface PopularLink {
  /** The address without a language prefix: /plans/…, /services/food. */
  href: string;
  label: string;
}

export interface PopularGroup {
  key: "businesses" | "plans" | "services" | "collections" | "guides" | "cars";
  heading: string;
  links: PopularLink[];
}

/** How many chips show before "Show more". */
export const POPULAR_VISIBLE = 15;
/** The most any row carries, "Show more" included — past this it is a sitemap, not a hint. */
const MAX_PER_GROUP = 40;

const T = {
  en: {
    title: "Popular on EverySub",
    businessesIn: (s: string) => `Popular businesses: ${s}`,
    plansIn: (s: string) => `Popular plans: ${s}`,
    similarPlans: "Similar plans",
    otherBusinesses: "Other businesses in this service",
    otherServices: "Other services in Roatán",
    topServices: "Top services in Roatán",
    collections: "Collections",
    guides: "Guides to Roatán",
    otherGuides: "Other guides",
    cars: "Cars for rent",
    rental: "Car rental companies",
    more: "Show more",
    less: "Show less",
  },
  es: {
    title: "Popular en EverySub",
    businessesIn: (s: string) => `Negocios populares: ${s}`,
    plansIn: (s: string) => `Planes populares: ${s}`,
    similarPlans: "Planes similares",
    otherBusinesses: "Otros negocios de este servicio",
    otherServices: "Otros servicios en Roatán",
    topServices: "Servicios más buscados en Roatán",
    collections: "Colecciones",
    guides: "Guías de Roatán",
    otherGuides: "Otras guías",
    cars: "Carros en renta",
    rental: "Empresas de renta de carros",
    more: "Mostrar más",
    less: "Mostrar menos",
  },
};

/** Words the block itself says (title, "Show more"), in a language. */
export const popularText = (lang: PopularLang) => T[lang];

// ─── Addresses — the same spelling as src/lib/services/serviceUrls.ts ────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORDS = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?(\d{1,12})$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SAFE_ID = /^[0-9a-zA-Z-]{1,90}$/;
const publicNoOf = (seg: string) => (UUID.test(seg) ? null : WORDS.exec(seg)?.[1] ?? null);
type Worded = { id: string; slug?: string | null; public_no?: number | string | null; source_plan_id?: string | null };
const words = (r: Worded) =>
  r.public_no === null || r.public_no === undefined || r.public_no === "" ? null : r.slug ? `${r.slug}-${r.public_no}` : String(r.public_no);
const planHref = (r: Worded) => `/plans/${words(r) ?? (r.source_plan_id || r.id)}`;
const carHref = (r: Worded) => `/cars/${words(r) ?? r.id}`;
const businessHref = (p: { id: string; slug?: string | null }) => `/businesses/${p.slug || p.id}`;
const serviceHref = (key: string) => (key === "vehicles" ? "/vehicles" : `/services/${key}`);

// ─── What a page is about ────────────────────────────────────────────────────

type Context =
  | { kind: "service"; key: string }
  | { kind: "plan"; seg: string }
  | { kind: "business"; seg: string }
  | { kind: "car"; seg: string }
  | { kind: "general"; guide?: string; collection?: string };

/** The page a path is, for the block — null where the block stays away (account, checkout, admin…). */
export function popularContext(path: string): Context | null {
  const parts = path.split("/").filter(Boolean);
  const [a, b, c, d] = parts;
  if (a === "services" && b && !c) return /^[a-z0-9_-]{1,40}$/.test(b) ? { kind: "service", key: b === "beach-club" ? "entertainment" : b } : null;
  if (a === "vehicles" && !b) return { kind: "service", key: "vehicles" };
  if (a === "plans" && b && !c && SAFE_ID.test(b)) return { kind: "plan", seg: b };
  if (a === "services" && c === "plans" && d && SAFE_ID.test(d)) return { kind: "plan", seg: d };
  if (a === "businesses" && b && !c && (UUID.test(b) || SLUG.test(b))) return { kind: "business", seg: b };
  if (a === "services" && c === "providers" && d) return { kind: "business", seg: d };
  if (a === "cars" && b && !c) return { kind: "car", seg: b };
  if (a === "discovery" && !b) return { kind: "general" };
  if (a === "guides" && !c) return { kind: "general", guide: b };
  if (a === "collections" && !c) return { kind: "general", collection: b };
  return null;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

const PUBLIC_PLANS = "status=eq.active&visibility=eq.public&parent_plan_id=is.null";
const PLAN_COLS = "id,name,provider_id,slug,public_no,source_plan_id,price_cents,sort_order";

interface Shop {
  services: Array<{ key: string; label: string }>;
  providers: any[];
  plans: any[];
  cars: any[];
  /** plan id → sales rank (1 = most bought). */
  rank: Map<string, number>;
}

async function readShop(rows: RowReader): Promise<Shop> {
  const [arch, providers, plans, cars, ranked] = await Promise.all([
    rows("service_archetypes?is_active=eq.true&select=key,label,sort_order&order=sort_order"),
    rows("providers?status=eq.active&select=id,name,slug,archetype_key,unit,sort_order&order=sort_order.asc.nullslast,name"),
    rows(`provider_plans?${PUBLIC_PLANS}&select=${PLAN_COLS}`),
    rows("rental_vehicles?status=eq.public&select=id,name,slug,public_no,provider_id,daily_price_cents&order=daily_price_cents.asc.nullslast"),
    // Absent until the backend migration is applied — [] then, and the order falls back.
    rows("rpc/popular_plans"),
  ]);
  const live = new Set(providers.map((p) => p.id));
  return {
    services: arch.filter((x) => x.key !== "vehicles" && x.key !== "rental" && x.key !== "business"),
    providers,
    plans: plans.filter((pl) => live.has(pl.provider_id)),
    cars: cars.filter((v) => !v.provider_id || live.has(v.provider_id)),
    rank: new Map(ranked.map((r) => [r.plan_id, Number(r.sales_rank) || 999])),
  };
}

const byPopularity = (rank: Map<string, number>) => (x: any, y: any) =>
  (rank.get(x.id) ?? 1e6) - (rank.get(y.id) ?? 1e6)
  || (x.sort_order ?? 1e6) - (y.sort_order ?? 1e6)
  || (x.price_cents ?? 1e9) - (y.price_cents ?? 1e9)
  || String(x.name).localeCompare(String(y.name));

// ─── Building the rows ───────────────────────────────────────────────────────

function build(shop: Shop, lang: PopularLang) {
  const providerById = new Map(shop.providers.map((p) => [p.id, p]));
  const keyOf = (providerId: string) => providerById.get(providerId)?.archetype_key ?? null;
  const sortedPlans = [...shop.plans].sort(byPopularity(shop.rank));

  /** A business's best rank — the business of the most-bought plan comes first. */
  const providerRank = new Map<string, number>();
  sortedPlans.forEach((pl, i) => { if (!providerRank.has(pl.provider_id)) providerRank.set(pl.provider_id, i); });
  const sortedProviders = [...shop.providers].sort((x, y) =>
    (providerRank.get(x.id) ?? 1e6) - (providerRank.get(y.id) ?? 1e6) || String(x.name).localeCompare(String(y.name)));

  const label = (key: string) => serviceSeo(key, lang)?.h1 ?? shop.services.find((s) => s.key === key)?.label ?? key;
  /** Services with something on sale — the others are empty pages — most bought first. */
  const selling = (): string[] => {
    const keys: string[] = [];
    sortedPlans.forEach((pl) => { const k = keyOf(pl.provider_id); if (k && !keys.includes(k)) keys.push(k); });
    // Any left with offers but no sales keep the admin's order.
    shop.services.forEach((s) => { if (!keys.includes(s.key) && sortedPlans.some((pl) => keyOf(pl.provider_id) === s.key)) keys.push(s.key); });
    const valid = new Set(shop.services.map((s) => s.key));
    const out = keys.filter((k) => valid.has(k));
    if (shop.cars.length) out.splice(Math.min(3, out.length), 0, "vehicles");
    return out;
  };

  const planLink = (pl: any): PopularLink => ({ href: planHref(pl), label: pl.name });
  const servicesLinks = (except?: string | null) => selling().filter((k) => k !== except).map((k) => ({ href: serviceHref(k), label: label(k) }));
  const businessLinks = (list: any[]) => list.map((p) => ({ href: businessHref(p), label: p.name }));
  const plansIn = (key: string) => sortedPlans.filter((pl) => keyOf(pl.provider_id) === key);
  const businessesIn = (key: string) => key === "vehicles"
    ? sortedProviders.filter((p) => p.unit === "vehicles")
    : sortedProviders.filter((p) => p.archetype_key === key);
  const carLinks = (list: any[]) => list.map((v) => ({ href: carHref(v), label: v.name }));

  return { label, sortedPlans, servicesLinks, businessLinks, plansIn, businessesIn, planLink, carLinks, providerById };
}

const group = (key: PopularGroup["key"], heading: string, links: PopularLink[]): PopularGroup => {
  const seen = new Set<string>();
  return { key, heading, links: links.filter((l) => l.href && !seen.has(l.href) && seen.add(l.href)).slice(0, MAX_PER_GROUP) };
};

/**
 * The rows of chips for a page, in a language. Empty rows are dropped; an
 * empty answer means the page shows no block.
 */
export async function popularFor(path: string, lang: PopularLang, rows: RowReader): Promise<PopularGroup[]> {
  const ctx = popularContext(path);
  if (!ctx) return [];
  const t = T[lang];
  const shop = await readShop(rows);
  const b = build(shop, lang);
  let groups: PopularGroup[] = [];

  if (ctx.kind === "service") {
    const key = ctx.key;
    if (key !== "vehicles" && !shop.services.some((s) => s.key === key)) return [];
    const name = key === "vehicles" ? t.cars : b.label(key);
    groups = key === "vehicles"
      ? [
          group("businesses", t.rental, b.businessLinks(b.businessesIn("vehicles"))),
          group("cars", t.cars, b.carLinks(shop.cars)),
        ]
      : [
          group("businesses", t.businessesIn(name), b.businessLinks(b.businessesIn(key))),
          group("plans", t.plansIn(name), b.plansIn(key).map(b.planLink)),
        ];
    groups.push(group("services", t.otherServices, b.servicesLinks(key)));
  }

  if (ctx.kind === "plan") {
    const no = publicNoOf(ctx.seg);
    const self = shop.plans.find((pl) => (no && String(pl.public_no) === no) || pl.id === ctx.seg || pl.source_plan_id === ctx.seg)
      // A combination's own address shows its offer's page; find the offer.
      ?? (await rows(`provider_plans?${no ? `public_no=eq.${no}` : UUID.test(ctx.seg) ? `id=eq.${ctx.seg}` : `source_plan_id=eq.${ctx.seg}`}&select=id,provider_id,parent_plan_id&limit=1`))[0];
    if (!self) return [];
    const ownId = self.parent_plan_id ?? self.id;
    const key = b.providerById.get(self.provider_id)?.archetype_key ?? null;
    if (key) {
      groups = [
        group("plans", t.similarPlans, b.plansIn(key).filter((pl) => pl.id !== ownId).map(b.planLink)),
        group("businesses", t.otherBusinesses, b.businessLinks(b.businessesIn(key).filter((p) => p.id !== self.provider_id))),
      ];
    }
    groups.push(group("services", t.otherServices, b.servicesLinks(key)));
  }

  if (ctx.kind === "business") {
    const p = shop.providers.find((x) => x.slug === ctx.seg || x.id === ctx.seg);
    if (!p) return [];
    const key: string | null = p.unit === "vehicles" ? "vehicles" : p.archetype_key;
    if (key === "vehicles") {
      groups = [
        group("cars", t.cars, b.carLinks(shop.cars.filter((v) => v.provider_id !== p.id))),
        group("businesses", t.rental, b.businessLinks(b.businessesIn("vehicles").filter((x) => x.id !== p.id))),
      ];
    } else if (key) {
      groups = [
        group("plans", t.similarPlans, b.plansIn(key).filter((pl) => pl.provider_id !== p.id).map(b.planLink)),
        group("businesses", t.otherBusinesses, b.businessLinks(b.businessesIn(key).filter((x) => x.id !== p.id))),
      ];
    }
    groups.push(group("services", t.otherServices, b.servicesLinks(key)));
  }

  if (ctx.kind === "car") {
    const no = publicNoOf(ctx.seg);
    const self = shop.cars.find((v) => (no && String(v.public_no) === no) || v.id === ctx.seg);
    groups = [
      group("cars", t.cars, b.carLinks(shop.cars.filter((v) => v.id !== self?.id))),
      group("businesses", t.rental, b.businessLinks(b.businessesIn("vehicles"))),
      group("services", t.otherServices, b.servicesLinks("vehicles")),
    ];
  }

  if (ctx.kind === "general") {
    const cols = await rows("home_collections?is_active=eq.true&select=id,title,slug&order=sort_order");
    groups = [
      group("services", t.topServices, b.servicesLinks()),
      group("collections", t.collections, cols.filter((c) => !ctx.collection || (c.slug !== ctx.collection && c.id !== ctx.collection))
        .map((c) => ({ href: `/collections/${c.slug || c.id}`, label: c.title }))),
      group("guides", ctx.guide ? t.otherGuides : t.guides, GUIDES.filter((g) => g.slug !== ctx.guide).map((g) => ({ href: `/guides/${g.slug}`, label: g[lang].title }))),
    ];
    // The home page adds the plans people buy most, the way a shop's front page does.
    if (!ctx.guide && !ctx.collection) groups.splice(1, 0, group("plans", T[lang].plansIn("Roatán"), b.sortedPlans.map(b.planLink)));
  }

  return groups.filter((g) => g.links.length);
}

