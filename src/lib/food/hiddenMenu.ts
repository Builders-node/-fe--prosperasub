import type { FoodMenuMeal } from "@/types/food";

/**
 * "Surprise menu" — a week published with `hide_dishes` on.
 *
 * The customer still sees WHICH meals land on which day, so they know a
 * Wednesday dinner is coming and can plan around it. They just don't see what
 * the dish is.
 *
 * Two rules make this real rather than cosmetic:
 *
 *   1. Redaction happens where the rows are READ, not where they're rendered.
 *      Hiding a name in JSX leaves it sitting in the network response for
 *      anyone who opens devtools — that isn't hidden, it's just not drawn.
 *   2. Every customer surface goes through here, so they can't drift apart and
 *      leak on one screen while hiding on another.
 *
 * The admin surfaces deliberately do NOT use this — the kitchen has to see what
 * it is cooking.
 */

/** Columns safe to fetch when a menu is hidden. Note: no meal_name. */
export const HIDDEN_MENU_COLUMNS = "id, menu_id, day_of_week, meal_type, sort_order, created_at";

/** Everything, for a normally published menu. */
export const VISIBLE_MENU_COLUMNS = "*";

/** Pick the column list for a menu's hidden state. */
export const menuColumnsFor = (hideDishes: boolean | null | undefined) =>
  hideDishes ? HIDDEN_MENU_COLUMNS : VISIBLE_MENU_COLUMNS;

/**
 * Belt-and-braces redaction for rows that were already fetched in full — the
 * gated backend endpoint returns whole rows, and a caller may hold a cached
 * copy from before the restaurant flipped the toggle.
 *
 * Keeps `day_of_week` and `meal_type` (that's the whole point) and blanks the
 * fields that would give the dish away.
 */
export function redactMeals<T extends Partial<FoodMenuMeal>>(
  meals: T[],
  hideDishes: boolean | null | undefined,
): T[] {
  if (!hideDishes) return meals;
  return meals.map((m) => ({
    ...m,
    meal_name: "",
    meal_description: null,
    image_url: null,
    calories: null,
  }));
}

/**
 * Collapse a hidden day to one entry per meal type: the customer needs "dinner
 * is coming", not "three unnamed dinner items are coming", which would leak the
 * course count.
 */
export function collapseHiddenMeals<T extends Partial<FoodMenuMeal>>(meals: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of meals) {
    const key = `${m.day_of_week}|${m.meal_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Copy shown in place of a dish name on a hidden menu. */
export const HIDDEN_DISH_LABEL = "Chef's choice";
