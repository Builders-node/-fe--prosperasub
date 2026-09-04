import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * The transport unit's own vehicle types — Cars, Motorbikes, Boats.
 *
 * `rental_categories`, deliberately not `service_categories`: transport has no
 * archetype and no service layer, so a type has nothing to hang under. The
 * type belongs to the PRODUCT (one provider can rent cars and motorbikes), so
 * every vehicle names its own and the business names none.
 */
export interface VehicleType {
  key: string;
  label: string;
  icon: string;
  accent: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export const VEHICLE_TYPES_KEY = ["vehicle-types"] as const;

export function useVehicleTypes(opts: { activeOnly?: boolean; enabled?: boolean } = {}) {
  const activeOnly = opts.activeOnly ?? true;
  return useQuery({
    queryKey: [...VEHICLE_TYPES_KEY, activeOnly],
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabaseDb.from("rental_categories").select("*").order("sort_order", { ascending: true });
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as VehicleType[];
    },
  });
}
