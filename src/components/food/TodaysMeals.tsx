import { useQuery } from "@tanstack/react-query";
import { Coffee, Sun, Moon, Apple, UtensilsCrossed, Flame } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { MEAL_TYPE_LABELS } from "@/types/food";
import type { FoodMenuMeal, FoodWeeklyMenu, MealType, DayOfWeek } from "@/types/food";

const DAY_KEYS: DayOfWeek[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const MEAL_META: Record<string, { icon: React.ReactNode; color: string }> = {
  breakfast: { icon: <Coffee className="h-3.5 w-3.5" />, color: "text-amber-400" },
  lunch:     { icon: <Sun className="h-3.5 w-3.5" />,    color: "text-yellow-400" },
  dinner:    { icon: <Moon className="h-3.5 w-3.5" />,   color: "text-indigo-400" },
  snack:     { icon: <Apple className="h-3.5 w-3.5" />,  color: "text-green-400" },
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack", "meal", "other"];

/** "08:00" → "8:00 AM" */
function to12h(hhmm?: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

interface Props {
  providerId: string;
  mealPlanId: string | null;
}

/** Today's dishes for an active food subscription, from the current published menu. */
export function TodaysMeals({ providerId, mealPlanId }: Props) {
  const todayKey = DAY_KEYS[new Date().getDay()];

  const { data } = useQuery({
    queryKey: ["todays-meals", providerId, mealPlanId, todayKey],
    enabled: !!providerId,
    queryFn: async () => {
      const { data: prov } = await supabaseDb
        .from("food_providers").select("name").eq("id", providerId).maybeSingle();
      const restaurantName: string | undefined = prov?.name ?? undefined;
      let menu: FoodWeeklyMenu | null = null;
      if (mealPlanId) {
        const { data: m } = await supabaseDb
          .from("food_weekly_menus").select("*")
          .eq("meal_plan_id", mealPlanId).eq("is_published", true)
          .order("week_start_date", { ascending: false }).limit(1);
        menu = m?.[0] ?? null;
      }
      if (!menu) {
        const { data: m } = await supabaseDb
          .from("food_weekly_menus").select("*")
          .eq("provider_id", providerId).is("meal_plan_id", null).eq("is_published", true)
          .order("week_start_date", { ascending: false }).limit(1);
        menu = m?.[0] ?? null;
      }
      if (!menu) return { meals: [] as FoodMenuMeal[], restaurantName, deliveryTimes: {} as Record<string, string> };
      const { data: meals } = await supabaseDb
        .from("food_menu_meals").select("*")
        .eq("menu_id", menu.id).eq("day_of_week", todayKey)
        .order("sort_order", { ascending: true });
      return {
        meals: (meals ?? []) as FoodMenuMeal[],
        restaurantName,
        deliveryTimes: (menu.delivery_times ?? {}) as Record<string, string>,
      };
    },
  });

  const meals = data?.meals ?? [];
  const restaurantName = data?.restaurantName;
  const deliveryTimes = data?.deliveryTimes ?? {};
  if (meals.length === 0) return null;

  // Group by meal type, in a sensible order.
  const byType = new Map<MealType, FoodMenuMeal[]>();
  meals.forEach((m) => {
    if (!byType.has(m.meal_type)) byType.set(m.meal_type, []);
    byType.get(m.meal_type)!.push(m);
  });
  const orderedTypes = [...byType.keys()].sort(
    (a, b) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(b),
  );

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long" });

  return (
    <div className="overflow-hidden rounded-3xl bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-bold text-foreground">Today's meals · {todayLabel}</p>
        {restaurantName && <span className="truncate text-xs text-muted-foreground">{restaurantName}</span>}
      </div>
      <div className="space-y-3">
        {orderedTypes.map((type) => {
          const meta = MEAL_META[type] ?? { icon: <UtensilsCrossed className="h-3.5 w-3.5" />, color: "text-muted-foreground" };
          return (
            <div key={type}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${meta.color}`}>
                  {meta.icon}
                  {MEAL_TYPE_LABELS[type] ?? type}
                </span>
                {to12h(deliveryTimes[type]) && (
                  <span className="text-xs text-muted-foreground">· {to12h(deliveryTimes[type])}</span>
                )}
              </div>
              <ul className="space-y-1.5">
                {byType.get(type)!.map((meal) => (
                  <li key={meal.id} className="rounded-2xl bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{meal.meal_name}</span>
                      {meal.calories && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                          <Flame className="h-3 w-3" />{meal.calories} kcal
                        </span>
                      )}
                    </div>
                    {meal.meal_description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{meal.meal_description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
