import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { RentalVehicle } from "../types/carRental";

/**
 * A car and the business that rents it out.
 *
 * The join is embedded rather than resolved separately because every surface
 * that shows a car also has to say whose it is — a fleet page listing three
 * companies' cars with no attribution is a worse page than one company's.
 */
const VEHICLE_SELECT = "*, provider:providers(id, name, avatar_url)";

/** Public fleet — everything not archived, publicly listable first. */
export function useVehicles(opts: { includeHidden?: boolean } = {}) {
  return useQuery({
    queryKey: ["rental-vehicles", opts.includeHidden ?? false],
    queryFn: async () => {
      let q = supabaseDb.from("rental_vehicles").select(VEHICLE_SELECT).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
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
      const { data, error } = await supabaseDb.from("rental_vehicles").select(VEHICLE_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as RentalVehicle | null;
    },
  });
}
