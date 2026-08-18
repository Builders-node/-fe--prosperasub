import type { MealType, FoodMealPlan } from "@/types/food";
import { addDaysISO, formatDateHN } from "@/lib/timezone";
import { itemKeys, type ProviderItem } from "@/lib/services/providerItems";

/**
 * Return the ordered meal-type columns to display for a given plan.
 *
 * Since `food_subscriptions.selected_meals` was introduced (see
 * MealSelectionPicker), the plan itself no longer dictates *which* meals the
 * customer receives — it only sets *how many* per day. A 2-meal plan can be
 * Breakfast+Lunch OR Breakfast+Dinner OR Lunch+Dinner depending on the
 * customer's choice, so every plan's menu editor must expose all three
 * meal columns for the chef to fill. The delivery manifest then reads the
 * subscription's `selected_meals` to decide what actually gets sent.
 *
 * `plan` is kept in the signature purely so callers don't have to change; the
 * result is the same three meals in canonical order for every plan.
 */
export function getMealTypesForPlan(
  _plan?: FoodMealPlan | null,
  items: ProviderItem[] = [],
): MealType[] {
  // Every column the provider offers, so the chef can fill any of them —
  // which is the same rule as before, now asked of the provider rather than
  // of a literal.
  return itemKeys(items) as MealType[];
}

/** Format a YYYY-MM-DD date as "June 10, 2026" */
export function formatWeekLabel(dateStr: string): string {
  return formatDateHN(dateStr, { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Add `days` days to a YYYY-MM-DD string and return YYYY-MM-DD.
 * Thin re-export of `addDaysISO` from lib/timezone — the local-parse-then-
 * .toISOString() version this used to be drifted by a day for admins in
 * positive-offset TZs (e.g. Europe). Keep the same signature so existing
 * callers don't have to change.
 */
export function addDaysToDate(dateStr: string, days: number): string {
  return addDaysISO(dateStr, days);
}
