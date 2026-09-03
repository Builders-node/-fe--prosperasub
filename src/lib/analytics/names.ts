import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Plan and provider names for the analytics screens.
 *
 * The rollup normalizes subscriptions but deliberately does not join names —
 * it would mean three joins in a query that already reads three tables. Names
 * live here instead: six tiny selects, one react-query key, shared by the
 * platform view and all three service views, so nobody re-fetches a plan list
 * per card.
 *
 * Ids do not collide across the tables (cleaning packages are slugs, the rest
 * are uuids), so one flat map per kind is enough.
 */

export interface AnalyticsNames {
  plans: Map<string, string>;
  providers: Map<string, string>;
}

const collect = (results: { data: any[] | null }[]) => {
  const map = new Map<string, string>();
  results.forEach((r) => (r.data ?? []).forEach((row: any) => {
    if (row?.id != null && row?.name) map.set(String(row.id), String(row.name));
  }));
  return map;
};

export async function fetchAnalyticsNames(): Promise<AnalyticsNames> {
  const [packages, mealPlans, providerPlans, vehicles, cleaningProviders, foodProviders, providers] =
    await Promise.all([
      supabaseDb.from("cleaning_packages").select("id, name"),
      supabaseDb.from("food_meal_plans").select("id, name"),
      supabaseDb.from("provider_plans").select("id, name"),
      // A rental booking's "plan" is the car it books.
      supabaseDb.from("rental_vehicles").select("id, name"),
      supabaseDb.from("cleaning_providers").select("id, name"),
      supabaseDb.from("food_providers").select("id, name"),
      supabaseDb.from("providers").select("id, name"),
    ]);
  return {
    plans: collect([packages, mealPlans, providerPlans, vehicles]),
    providers: collect([cleaningProviders, foodProviders, providers]),
  };
}

/** The shared react-query key — one fetch for every analytics screen. */
export const ANALYTICS_NAMES_KEY = ["admin-analytics-names"] as const;
