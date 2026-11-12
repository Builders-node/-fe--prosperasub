import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Where each listed offer is sold, and which diets it carries — for the one
 * service listing (pages/ServicePage.tsx).
 *
 * Food and cleaning kept these facts in their own tables, keyed by the LEGACY
 * plan / provider id, while the listing now reads the universal
 * `provider_plans` (an offer, with its sizes / meal counts as variants under
 * it). So the facts are gathered per offer from every row it is made of:
 *
 *   areas  — cleaning_package_residences, food_meal_plan_residences and
 *            food_provider_residences. An empty list means "everywhere"
 *            (useResidenceFilter's rule). An offer is sold in a place when ANY
 *            of its variants is; one variant with no list makes it everywhere.
 *   diets  — food_meal_plans.dietary_tags, unioned over the variants, plus the
 *            universal plan's own `tags` that name a known diet.
 *
 * A service with no legacy rows (clubs, healthcare) costs two tiny queries
 * that return nothing, and every offer then serves everywhere.
 */

export interface OfferFacts {
  /** offer id → residence ids it is sold in; missing or [] = everywhere. */
  areas: Map<string, string[]>;
  /** universal provider id → residence ids the business serves; [] = everywhere. */
  providerAreas: Map<string, string[]>;
  /** offer id → diet tags. */
  diets: Map<string, string[]>;
}

const EMPTY: OfferFacts = { areas: new Map(), providerAreas: new Map(), diets: new Map() };

export function useOfferFacts(
  archetypeKey: string | null | undefined,
  offers: Array<{ id: string; tags?: unknown }>,
  providers: Array<{ id: string; source_provider_id?: string | null; source_service_key?: string | null }>,
) {
  const offerIds = offers.map((o) => String(o.id)).sort();
  return useQuery({
    queryKey: ["offer-facts", archetypeKey, offerIds.join(","), providers.length],
    enabled: !!archetypeKey && offerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchOfferFacts(offers, providers),
    placeholderData: EMPTY,
  });
}

export async function fetchOfferFacts(
  offers: Array<{ id: string; tags?: unknown }>,
  providers: Array<{ id: string; source_provider_id?: string | null; source_service_key?: string | null }>,
): Promise<OfferFacts> {
      const offerIds = offers.map((o) => String(o.id));
      // Every row an offer is made of: itself and its variants.
      const { data: rows, error } = await supabaseDb
        .from("provider_plans")
        .select("id, parent_plan_id, source_plan_id, source_service_key")
        .or(`id.in.(${offerIds.join(",")}),parent_plan_id.in.(${offerIds.join(",")})`);
      if (error) throw error;

      const offerOf = new Map<string, string>(); // legacy plan id → offer id
      const legacy = { food: [] as string[], cleaning: [] as string[] };
      const members = new Map<string, number>(); // offer id → how many rows it has
      for (const r of rows ?? []) {
        const offer = String(r.parent_plan_id ?? r.id);
        members.set(offer, (members.get(offer) ?? 0) + 1);
        if (!r.source_plan_id) continue;
        offerOf.set(String(r.source_plan_id), offer);
        if (r.source_service_key === "food") legacy.food.push(String(r.source_plan_id));
        if (r.source_service_key === "cleaning") legacy.cleaning.push(String(r.source_plan_id));
      }

      const foodProviders = providers.filter((p) => p.source_service_key === "food" && p.source_provider_id);
      const [cleanLinks, foodLinks, foodPlans, provLinks] = await Promise.all([
        legacy.cleaning.length
          ? supabaseDb.from("cleaning_package_residences").select("package_id, residence_id").in("package_id", legacy.cleaning)
          : Promise.resolve({ data: [] as any[] }),
        legacy.food.length
          ? supabaseDb.from("food_meal_plan_residences").select("meal_plan_id, residence_id").in("meal_plan_id", legacy.food)
          : Promise.resolve({ data: [] as any[] }),
        legacy.food.length
          ? supabaseDb.from("food_meal_plans").select("id, dietary_tags").in("id", legacy.food)
          : Promise.resolve({ data: [] as any[] }),
        foodProviders.length
          ? supabaseDb.from("food_provider_residences").select("provider_id, residence_id")
              .in("provider_id", foodProviders.map((p) => p.source_provider_id!))
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Per legacy row: its own list. Then per offer: the union — unless one
      // member has no list at all, which makes the offer "everywhere".
      const perLegacy = new Map<string, string[]>();
      const link = (planId: unknown, residenceId: unknown) => {
        const k = String(planId);
        perLegacy.set(k, [...(perLegacy.get(k) ?? []), String(residenceId)]);
      };
      for (const l of (cleanLinks.data ?? []) as any[]) link(l.package_id, l.residence_id);
      for (const l of (foodLinks.data ?? []) as any[]) link(l.meal_plan_id, l.residence_id);

      const areas = new Map<string, string[]>();
      const everywhere = new Set<string>();
      for (const r of rows ?? []) {
        const offer = String(r.parent_plan_id ?? r.id);
        // The offer row itself (no legacy twin) says nothing about places when
        // it has variants — only its members do.
        if (!r.source_plan_id) {
          if ((members.get(offer) ?? 1) === 1) everywhere.add(offer);
          continue;
        }
        const list = perLegacy.get(String(r.source_plan_id)) ?? [];
        if (list.length === 0) { everywhere.add(offer); continue; }
        areas.set(offer, [...new Set([...(areas.get(offer) ?? []), ...list])]);
      }
      for (const o of everywhere) areas.set(o, []);

      const diets = new Map<string, string[]>();
      for (const p of (foodPlans.data ?? []) as any[]) {
        const offer = offerOf.get(String(p.id));
        if (!offer || !Array.isArray(p.dietary_tags)) continue;
        diets.set(offer, [...new Set([...(diets.get(offer) ?? []), ...p.dietary_tags.map(String)])]);
      }
      for (const o of offers) {
        if (!Array.isArray(o.tags)) continue;
        diets.set(String(o.id), [...new Set([...(diets.get(String(o.id)) ?? []), ...(o.tags as unknown[]).map(String)])]);
      }

      const byLegacyProvider = new Map(foodProviders.map((p) => [String(p.source_provider_id), p.id]));
      const providerAreas = new Map<string, string[]>();
      for (const l of (provLinks.data ?? []) as any[]) {
        const id = byLegacyProvider.get(String(l.provider_id));
        if (id) providerAreas.set(id, [...(providerAreas.get(id) ?? []), String(l.residence_id)]);
      }

      return { areas, providerAreas, diets };
}
