import type { MealType, FoodMealPlan } from "@/types/food";

/**
 * Return the ordered meal-type columns to display for a given plan.
 * - No plan (provider-level menu) → show all 3
 * - meals_per_day >= 3             → breakfast + lunch + dinner
 * - meals_per_day === 2            → lunch + dinner
 * - meals_per_day === 1            → lunch only
 */
export function getMealTypesForPlan(plan: FoodMealPlan | null | undefined): MealType[] {
  if (!plan) return ["breakfast", "lunch", "dinner"];
  const mpd = plan.meals_per_day ?? 3;
  if (mpd >= 3) return ["breakfast", "lunch", "dinner"];
  if (mpd === 2) return ["lunch", "dinner"];
  return ["lunch"];
}

/** Format a YYYY-MM-DD date as "June 10, 2026" */
export function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Add `days` days to a YYYY-MM-DD string and return YYYY-MM-DD */
export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
