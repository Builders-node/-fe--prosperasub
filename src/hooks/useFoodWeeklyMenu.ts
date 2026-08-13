import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { FoodWeeklyMenu, FoodMenuMeal } from "@/types/food";

/**
 * This week's menu for a meal plan.
 *
 * Lifted out of the food checkout so the plan page can show it, which is
 * where it belongs: what is being cooked this week is the reason to buy, not
 * a thing to read at the till.
 *
 * Falls back to the provider's own week when a plan has no menu of its own,
 * and honours "surprise week" — when `hide_dishes` is set the dish columns
 * are not selected at all, so the names cannot leak through the network tab.
 */

/** A surprise week must not ship the dish names to the browser at all. */
const menuColumnsFor = (hidden: boolean) =>
  hidden ? "id, menu_id, day_of_week, meal_type, sort_order"
         : "*";

export function useFoodWeeklyMenu(planId: string | undefined, providerId: string | undefined) {
  return useQuery({
    queryKey: ["food-plan-menu", planId, providerId],
    enabled: !!planId,
    queryFn: async () => {
      const { data: planMenus } = await supabaseDb
        .from("food_weekly_menus").select("*")
        .eq("meal_plan_id", planId!)
        .eq("is_published", true)
        .order("week_start_date", { ascending: false })
        .limit(1);

      let menu: FoodWeeklyMenu | null = planMenus?.[0] ?? null;

      if (!menu && providerId) {
        const { data: providerMenus } = await supabaseDb
          .from("food_weekly_menus").select("*")
          .eq("provider_id", providerId)
          .is("meal_plan_id", null)
          .eq("is_published", true)
          .order("week_start_date", { ascending: false })
          .limit(1);
        menu = providerMenus?.[0] ?? null;
      }

      if (!menu) return null;

      const hidden = !!menu.hide_dishes;
      const { data: meals } = await supabaseDb
        .from("food_menu_meals").select(menuColumnsFor(hidden))
        .eq("menu_id", menu.id)
        .order("sort_order", { ascending: true });

      return { menu, meals: (meals ?? []) as unknown as FoodMenuMeal[], hidden };
    },
  });
}
