import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { PlanCardRating } from "@/components/patterns/PlanCard";

/**
 * Average rating and review count per provider, for a set of providers.
 *
 * Ratings are a property of the business, not of one plan — a customer rates
 * "the restaurant", and every plan that restaurant sells carries that score.
 * All of them live in `provider_reviews`, keyed by the UNIVERSAL providers.id.
 *
 * `legacyService` is the escape hatch for callers holding legacy ids: the food
 * listing knows `food_providers.id`, which is not the same id-space (see
 * lib/services/providerBridge). Pass the source key and the result comes back
 * keyed by the legacy ids you passed in, so the caller never has to think
 * about the bridge.
 *
 * Providers with no reviews are simply absent from the map — the card renders
 * no rating rather than a zero.
 */
export function useProviderRatings(
  providerIds: Array<string | null | undefined>,
  opts?: { legacyService?: string },
) {
  const ids = Array.from(new Set(providerIds.filter((id): id is string => !!id))).sort();
  const legacyService = opts?.legacyService ?? null;

  const { data } = useQuery({
    queryKey: ["provider-ratings", legacyService, ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, PlanCardRating>> => {
      // legacy id → universal id, when asked for.
      let universalOf = new Map<string, string>(ids.map((id) => [id, id]));
      if (legacyService) {
        const { data: bridge, error } = await supabaseDb
          .from("providers")
          .select("id, source_provider_id")
          .eq("source_service_key", legacyService)
          .in("source_provider_id", ids);
        if (error) throw error;
        universalOf = new Map(
          (bridge ?? [])
            .filter((r: any) => r.source_provider_id)
            .map((r: any) => [String(r.source_provider_id), String(r.id)]),
        );
      }

      const universalIds = Array.from(new Set([...universalOf.values()]));
      if (!universalIds.length) return {};

      const { data: rows, error } = await supabaseDb
        .from("provider_reviews")
        .select("provider_id, rating")
        .in("provider_id", universalIds);
      if (error) throw error;

      const totals = new Map<string, { sum: number; count: number }>();
      (rows ?? []).forEach((r: any) => {
        const rating = Number(r.rating);
        if (!Number.isFinite(rating)) return;
        const entry = totals.get(r.provider_id) ?? { sum: 0, count: 0 };
        entry.sum += rating;
        entry.count += 1;
        totals.set(r.provider_id, entry);
      });

      // Key the answer by whatever ids the caller handed in.
      const out: Record<string, PlanCardRating> = {};
      universalOf.forEach((universalId, callerId) => {
        const entry = totals.get(universalId);
        if (entry?.count) out[callerId] = { average: entry.sum / entry.count, count: entry.count };
      });
      return out;
    },
  });

  return data ?? {};
}
