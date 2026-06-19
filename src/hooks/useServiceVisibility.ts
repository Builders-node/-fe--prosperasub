import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

export type ServiceCategory = "cleaning" | "cars" | "food" | "beach";

const KEY_BY_CATEGORY: Record<ServiceCategory, string> = {
  cleaning: "category_cleaning_visible",
  cars: "category_cars_visible",
  food: "category_food_visible",
  beach: "category_beach_visible",
};

export type ServiceVisibility = Record<ServiceCategory, boolean>;

const ALL_VISIBLE: ServiceVisibility = { cleaning: true, cars: true, food: true, beach: true };

/**
 * Reads which service categories are enabled for regular users, from the public
 * `global_settings` table. Categories default to visible when no flag is set.
 * Admins decide these in Platform Settings; the gating itself is applied by callers.
 */
export function useServiceVisibility() {
  return useQuery<ServiceVisibility>({
    queryKey: ["service-visibility"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("global_settings")
        .select("key,value")
        .in("key", Object.values(KEY_BY_CATEGORY));
      if (error) return ALL_VISIBLE;

      const map = new Map((data ?? []).map((r: any) => [r.key, r.value]));
      const visible = (key: string) => {
        const v = map.get(key);
        return v === undefined || v === null ? true : v === true || v === "true";
      };
      return {
        cleaning: visible(KEY_BY_CATEGORY.cleaning),
        cars: visible(KEY_BY_CATEGORY.cars),
        food: visible(KEY_BY_CATEGORY.food),
        beach: visible(KEY_BY_CATEGORY.beach),
      };
    },
    staleTime: 60_000,
    placeholderData: ALL_VISIBLE,
  });
}
