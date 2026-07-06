import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { Ad } from "@/types/ad";

/**
 * Fetches all active ads for a given placement, ordered by priority.
 * Returns [] on error — ads must never break the page.
 */
export function useActiveAds(placement: string) {
  return useQuery({
    queryKey: ["active-ads", placement],
    queryFn: async (): Promise<Ad[]> => {
      const { data, error } = await supabaseDb
        .from("promo_banners")
        .select("*")
        .eq("placement", placement)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return [];
      return (data ?? []) as Ad[];
    },
    staleTime: 1000 * 60 * 5,
  });
}
