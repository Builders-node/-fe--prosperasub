import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { InsuranceTier, RentalExtra, DeliveryZone } from "../types/carRental";

/**
 * One business's rental terms — its insurance tiers, its extras, its delivery
 * zones.
 *
 * Scoped by provider, and deliberately without a fallback to "everyone's".
 * These used to be platform-wide, which was invisible with one rental company
 * and wrong with two: the second would be selling the first's coverage at the
 * first's prices. A company that has configured nothing offers nothing, which
 * is the honest answer — not somebody else's terms.
 *
 * `includeInactive` is for the editor, which has to show what it can turn back
 * on. Checkout never passes it.
 */
export function useAddons(providerId?: string | null, opts: { includeInactive?: boolean } = {}) {
  const showAll = opts.includeInactive ?? false;
  return useQuery({
    queryKey: ["rental-addons", providerId ?? "none", showAll],
    enabled: !!providerId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const scoped = (table: string) => {
        const q = supabaseDb.from(table).select("*").eq("provider_id", providerId!);
        return (showAll ? q : q.eq("is_active", true)).order("sort_order");
      };
      const [ins, ext, zones] = await Promise.all([
        scoped("rental_insurance_tiers"),
        scoped("rental_extras"),
        scoped("rental_delivery_zones"),
      ]);
      if (ins.error) throw ins.error;
      if (ext.error) throw ext.error;
      if (zones.error) throw zones.error;
      return {
        insurance: (ins.data ?? []) as InsuranceTier[],
        extras: (ext.data ?? []) as RentalExtra[],
        zones: (zones.data ?? []) as DeliveryZone[],
      };
    },
  });
}
