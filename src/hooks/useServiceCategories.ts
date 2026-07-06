import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { resolveCategoryIcon } from "@/lib/services/categoryIcons";
import type { LucideIcon } from "lucide-react";

export interface ServiceCategoryRow {
  key: string;
  label: string;
  icon: string;      // raw icon key from DB
  accent: string;
  sort_order: number;
  is_active: boolean;
}

export interface ServiceCategoryResolved extends ServiceCategoryRow {
  Icon: LucideIcon;  // resolved component
}

/**
 * Live list of service categories from the DB. Admin edits in
 * `/admin/categories` reflect here via React Query invalidation.
 * `onlyActive` (default true) filters out categories the platform
 * has hidden.
 */
export function useServiceCategories(onlyActive: boolean = true) {
  const query = useQuery({
    queryKey: ["service-categories", onlyActive],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabaseDb.from("service_categories").select("*").order("sort_order", { ascending: true });
      if (onlyActive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as ServiceCategoryRow[]).map<ServiceCategoryResolved>((r) => ({
        ...r, Icon: resolveCategoryIcon(r.icon),
      }));
    },
  });
  return {
    categories: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
