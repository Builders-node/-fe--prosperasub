import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

export interface Residence {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Residences / communities (e.g. Pristine Bay, Duna Residences). Data-driven via
 * the `food_residences` table so new ones can be added without a code change.
 */
export function useResidences(includeInactive = false) {
  return useQuery({
    queryKey: ["food-residences", includeInactive],
    queryFn: async () => {
      let q = supabaseDb
        .from("food_residences")
        .select("id, name, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Residence[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
