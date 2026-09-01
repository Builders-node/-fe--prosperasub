import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { RentalVehicle } from "@/types/carRental";

/** Public fleet — everything not archived, publicly listable first. */
export function useVehicles(opts: { includeHidden?: boolean } = {}) {
  return useQuery({
    queryKey: ["rental-vehicles", opts.includeHidden ?? false],
    queryFn: async () => {
      let q = supabaseDb.from("rental_vehicles").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
      if (!opts.includeHidden) q = q.eq("status", "public");
      else q = q.neq("status", "archived");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RentalVehicle[];
    },
  });
}

export function useVehicle(id?: string) {
  return useQuery({
    queryKey: ["rental-vehicle", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("rental_vehicles").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as RentalVehicle | null;
    },
  });
}
