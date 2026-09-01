import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { InsuranceTier, RentalExtra, DeliveryZone } from "@/types/carRental";

/** The whole active add-on catalog — insurance tiers, extras, delivery zones. */
export function useAddons() {
  return useQuery({
    queryKey: ["rental-addons"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [ins, ext, zones] = await Promise.all([
        supabaseDb.from("rental_insurance_tiers").select("*").eq("is_active", true).order("sort_order"),
        supabaseDb.from("rental_extras").select("*").eq("is_active", true).order("sort_order"),
        supabaseDb.from("rental_delivery_zones").select("*").eq("is_active", true).order("sort_order"),
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
