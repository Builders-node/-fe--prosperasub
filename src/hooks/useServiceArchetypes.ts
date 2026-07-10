import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { resolveCategoryIcon } from "@/lib/services/categoryIcons";
import type { LucideIcon } from "lucide-react";

/**
 * Service archetypes: the business-unit templates a provider inherits from.
 * Distinct from `service_categories` (UI grouping) — archetypes carry
 * operational defaults (capabilities, resource type, booking model, settings).
 */
export interface ServiceArchetypeRow {
  key: string;
  label: string;
  description: string | null;
  category_key: string | null;
  icon: string | null;
  accent: string;
  default_capabilities: string[];
  default_resource_type: string | null;
  default_booking_model: "time_slot" | "date_range" | "capacity_seat" | null;
  default_booking_settings: unknown;
  /** Optional legacy service key (cars/food/cleaning/beach) — drives legacy listing dispatch. */
  source_service_key: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface ServiceArchetype extends ServiceArchetypeRow {
  Icon: LucideIcon;
}

/** Fetch archetypes (active-only by default). */
export function useServiceArchetypes(activeOnly = true) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["service-archetypes", activeOnly],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabaseDb.from("service_archetypes").select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ServiceArchetypeRow[];
    },
  });

  const archetypes = useMemo<ServiceArchetype[]>(
    () => rows.map((r) => ({ ...r, Icon: resolveCategoryIcon(r.icon ?? "Store") })),
    [rows],
  );

  return { archetypes, isLoading };
}
