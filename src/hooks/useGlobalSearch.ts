import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { publicListingHref } from "@/lib/services/providerBridge";
import { providerHref } from "@/lib/services/serviceUrls";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";

/**
 * "Search on Everysub" — one field over the whole catalogue.
 *
 * The per-listing search added earlier only ever narrows the page you are
 * already on: someone who knows they want a car wash has to guess that it
 * lives under Cleaning before they can search for it. This searches the four
 * things a customer can actually name — a service, a category, a business, a
 * plan — and every hit is a link to the place that sells it.
 *
 * Everything is fetched once and filtered in the browser. The whole catalogue
 * is a few dozen rows; a server round-trip per keystroke would be slower and
 * would put a query behind every letter someone types.
 */

export type SearchKind = "service" | "category" | "provider" | "plan";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** The line under the title — what this is, or who sells it. */
  subtitle: string | null;
  href: string;
  priceCents: number | null;
  priceUnit: string | null;
  /** An offer costs more once you pick options — so its price reads "from". */
  priceFrom?: boolean;
  /** Everything the query is matched against, joined by the caller. */
  haystack: string;
}

/** One legacy plan row's own page, by the service it belongs to. */
function legacyPlanHref(provider: any, legacyPlanId: string): string {
  switch (provider?.source_service_key) {
    case "food":     return `/services/food/${provider.source_provider_id}/plans/${legacyPlanId}`;
    case "cleaning": return `/services/cleaning/plans/${legacyPlanId}`;
    case "beach":    return `/services/beach-club/plans/${legacyPlanId}`;
    default:         return "/discovery";
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function useGlobalSearch(query: string) {
  const { archetypes } = useServiceArchetypes(true);

  const { data, isLoading } = useQuery({
    queryKey: ["global-search-catalogue"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [categories, providers, plans, cleaning, food, vehicles, beach] = await Promise.all([
        supabaseDb.from("service_categories")
          .select("key, label, archetype_key").eq("is_active", true),
        supabaseDb.from("providers")
          .select("id, name, description, archetype_key, category_key, source_service_key, source_provider_id")
          .eq("status", "active"),
        // Offers AND variants: the variants are what tells us which legacy
        // rows have collapsed into one offer, and which of them a hit on the
        // offer should open.
        supabaseDb.from("provider_plans")
          .select("id, provider_id, name, description, price_cents, period, parent_plan_id, source_service_key, source_plan_id")
          .eq("status", "active"),
        supabaseDb.from("cleaning_packages")
          .select("id, name, description, owner_provider_id, monthly_price_cents, price_per_cleaning_cents, cleanings_per_month")
          .eq("status", "active").is("deleted_at", null).eq("visibility", "public"),
        supabaseDb.from("food_meal_plans")
          .select("id, name, description, provider_id, weekly_price_cents").eq("status", "active"),
        supabaseDb.from("rental_vehicles")
          .select("id, name, brand, model, description, daily_price_cents").eq("status", "public"),
        supabaseDb.from("beach_club_plans")
          .select("id, name, tagline, price_per_person_cents").eq("is_active", true),
      ]);
      return {
        categories: categories.data ?? [],
        providers: providers.data ?? [],
        plans: plans.data ?? [],
        cleaning: cleaning.data ?? [],
        food: food.data ?? [],
        vehicles: vehicles.data ?? [],
        beach: beach.data ?? [],
      };
    },
  });

  const archetypeByKey = new Map(archetypes.map((a) => [a.key, a]));
  const hits: SearchHit[] = [];

  if (data) {
    // ── Services ────────────────────────────────────────────────────────────
    archetypes.forEach((a) => {
      hits.push({
        kind: "service", id: a.key, title: a.label,
        subtitle: a.description ?? null,
        href: publicListingHref(a.source_service_key, a.key) ?? "/discovery",
        priceCents: null, priceUnit: null,
        haystack: [a.label, a.description].filter(Boolean).join(" "),
      });
    });

    // ── Categories ──────────────────────────────────────────────────────────
    data.categories.forEach((c: any) => {
      const a = archetypeByKey.get(c.archetype_key);
      const listing = publicListingHref(a?.source_service_key, c.archetype_key);
      hits.push({
        kind: "category", id: c.key, title: c.label,
        subtitle: a?.label ?? null,
        href: listing ? `${listing}?category=${encodeURIComponent(c.key)}` : "/discovery",
        priceCents: null, priceUnit: null,
        haystack: [c.label, a?.label].filter(Boolean).join(" "),
      });
    });

    // ── Businesses ──────────────────────────────────────────────────────────
    const providerName = new Map<string, string>();
    const legacyProviderName = new Map<string, string>();
    const providerRows = new Map<string, any>();
    data.providers.forEach((p: any) => {
      providerName.set(String(p.id), p.name);
      providerRows.set(String(p.id), p);
      if (p.source_provider_id) legacyProviderName.set(String(p.source_provider_id), p.name);
      const a = archetypeByKey.get(p.archetype_key);
      hits.push({
        kind: "provider", id: String(p.id), title: p.name,
        subtitle: a?.label ?? null,
        href: providerHref(p.archetype_key ?? "", String(p.id)),
        priceCents: null, priceUnit: null,
        haystack: [p.name, p.description, a?.label].filter(Boolean).join(" "),
      });
    });

    /**
     * Which legacy rows belong to an offer, and where an offer should open.
     *
     * Searching "elias" listed seven results for one product: the offer and
     * all six of its combinations. A variant is reached by picking options on
     * its offer, so only the offer is a result — and clicking it opens the
     * cheapest combination, which is the same door the listing card uses.
     */
    const variantSourceIds = new Set<string>();
    const offerCheapestSource = new Map<string, { sourceId: string; cents: number }>();
    data.plans.forEach((v: any) => {
      if (!v.parent_plan_id || !v.source_plan_id) return;
      variantSourceIds.add(String(v.source_plan_id));
      const parent = String(v.parent_plan_id);
      const cents = Number(v.price_cents ?? 0);
      const best = offerCheapestSource.get(parent);
      if (!best || cents < best.cents) {
        offerCheapestSource.set(parent, { sourceId: String(v.source_plan_id), cents });
      }
    });

    // ── Plans, per service, each linking where it is actually bought ────────
    const push = (
      id: string, title: string, subtitle: string | null, href: string,
      priceCents: number | null, priceUnit: string | null, extra: unknown[] = [],
      priceFrom = false,
    ) => hits.push({
      kind: "plan", id, title, subtitle, href, priceCents, priceUnit, priceFrom,
      haystack: [title, subtitle, ...extra].filter(Boolean).join(" "),
    });

    data.cleaning.forEach((p: any) => {
      if (variantSourceIds.has(String(p.id))) return;
      const monthly = p.monthly_price_cents
        ?? (p.price_per_cleaning_cents ?? 0) * (p.cleanings_per_month ?? 1);
      push(String(p.id), p.name, providerName.get(String(p.owner_provider_id)) ?? "Cleaning",
           `/services/cleaning/plans/${p.id}`, monthly || null, "/ month", [p.description]);
    });
    data.food.forEach((p: any) => {
      if (variantSourceIds.has(String(p.id))) return;
      push(String(p.id), p.name, legacyProviderName.get(String(p.provider_id)) ?? "Food",
           `/services/food/${p.provider_id}/plans/${p.id}`, p.weekly_price_cents ?? null, "/ week",
           [p.description]);
    });
    data.vehicles.forEach((v: any) => {
      push(String(v.id), v.name, [v.brand, v.model].filter(Boolean).join(" ") || "Rental",
           `/services/rental/${v.id}`, v.daily_price_cents ?? null, "/ day", [v.description]);
    });
    data.beach.forEach((p: any) => {
      push(String(p.id), p.name, "Beach Club",
           `/services/beach-club/plans/${p.id}`, p.price_per_person_cents ?? null,
           "/ person · month", [p.tagline]);
    });
    data.plans.forEach((p: any) => {
      // A variant is represented by its offer; a mirror of a standalone legacy
      // row is already listed above with the right link.
      if (p.parent_plan_id) return;
      if (p.source_plan_id) return;

      const cheapest = offerCheapestSource.get(String(p.id));
      const provider = providerRows.get(String(p.provider_id));
      const href = cheapest
        // An offer opens on its cheapest combination — the same door the
        // listing card uses, so the option chips are already there.
        ? legacyPlanHref(provider, cheapest.sourceId)
        // A plan with no legacy row behind it has its own page under whatever
        // archetype its provider belongs to.
        : `/services/${provider?.archetype_key ?? "beach-club"}/plans/${p.id}`;

      push(String(p.id), p.name, providerName.get(String(p.provider_id)) ?? null, href,
           p.price_cents ?? null, p.period === "weekly" ? "/ week" : "/ month", [p.description],
           !!cheapest);
    });
  }

  const terms = norm(query.trim()).split(/\s+/).filter(Boolean);
  const results = terms.length
    ? hits.filter((h) => {
        const hay = norm(h.haystack);
        return terms.every((t) => hay.includes(t));
      })
    : [];

  return { results, isLoading, hasCatalogue: !!data };
}

/** Group order on screen: the broadest answer first, the most specific last. */
export const SEARCH_GROUPS: Array<{ kind: SearchKind; label: string }> = [
  { kind: "category", label: "Categories" },
  { kind: "service", label: "Services" },
  { kind: "provider", label: "Businesses" },
  { kind: "plan", label: "Plans" },
];
