import { Coffee, Sun, Moon, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  itemKeys, itemLabel, sortItemKeys, LEGACY_MEAL_KEYS, type ProviderItem,
} from "@/lib/services/providerItems";

/**
 * What a customer picks is what the provider offers.
 *
 * These three keys were the platform's idea of a day and are now only a
 * fallback for a provider whose dictionary is empty. Everything below takes
 * `items` (from `provider_items`) and reads names, order and the list itself
 * from there, so a restaurant that sells brunch can sell brunch.
 */
export const MEAL_KEYS = LEGACY_MEAL_KEYS;
/** Free text, like `service_occurrences.item_key` — not a union any more. */
export type MealKey = string;

/** Decoration only: the pictures for the meals this platform shipped with. */
const MEAL_ICON: Record<string, typeof Coffee> = {
  breakfast: Coffee, lunch: Sun, dinner: Moon,
};
const iconFor = (key: string) => MEAL_ICON[key] ?? UtensilsCrossed;

/** Sort into the provider's own order — [dinner, breakfast] → [breakfast, dinner]. */
export function sortMeals(meals: MealKey[], items: ProviderItem[] = []): MealKey[] {
  return sortItemKeys(meals, items);
}

/** Human-readable summary — "Breakfast · Lunch" or "Lunch" or "—" (empty). */
export function formatMeals(meals: string[] | null | undefined, items: ProviderItem[] = []): string {
  if (!meals?.length) return "—";
  return sortMeals(meals, items).map((m) => itemLabel(m, items)).join(" · ");
}

/**
 * Meal selection picker. Renders three toggle chips; the customer clicks up to
 * `mealsPerDay` unique meals. No duplicates — a "2 lunches" desire is a
 * separate plan, not a per-subscription override.
 *
 * Controlled: parent owns `value` and receives normalized `onChange` updates.
 * `isValid = value.length === mealsPerDay` — parent uses that to gate the Pay
 * button on checkout.
 */
export function MealSelectionPicker({
  value,
  onChange,
  mealsPerDay,
  items = [],
  disabled,
}: {
  value: MealKey[];
  onChange: (next: MealKey[]) => void;
  mealsPerDay: number;
  /** What this provider delivers in a day. Empty falls back to the old three. */
  items?: ProviderItem[];
  disabled?: boolean;
}) {
  const options = itemKeys(items);
  const selected = new Set(value);
  const cap = Math.max(1, Math.min(mealsPerDay, options.length));
  const isValid = value.length === cap;

  const toggle = (m: MealKey) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(m)) {
      next.delete(m);
    } else {
      // At the cap: kick the earliest-picked meal out so the click still lands
      // instead of silently no-op'ing (which used to confuse test subjects who
      // didn't notice their click was ignored).
      if (next.size >= cap) {
        const first = value[0];
        if (first) next.delete(first);
      }
      next.add(m);
    }
    onChange(sortMeals(Array.from(next), items));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold text-foreground">
          Pick your {cap} {cap === 1 ? "meal" : "meals"} per day
        </p>
        <p
          className={cn(
            "text-xs font-bold tabular-nums",
            isValid ? "text-emerald-500" : "text-muted-foreground",
          )}
        >
          {value.length} / {cap}
        </p>
      </div>

      {/* Two per row on a narrow phone, and however many the provider has —
          a fixed three-column grid left a fourth item alone on its own line. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((meal) => {
          const on = selected.has(meal);
          const Icon = iconFor(meal);
          return (
            <button
              key={meal}
              type="button"
              onClick={() => toggle(meal)}
              disabled={disabled}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-radius-md px-3 py-4 transition-colors",
                on
                  ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
              aria-pressed={on}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{itemLabel(meal, items)}</span>
            </button>
          );
        })}
      </div>

      {!isValid && value.length > 0 && value.length < cap && (
        <p className="text-xs text-muted-foreground">
          Pick {cap - value.length} more to continue.
        </p>
      )}
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Choose {cap === 1 ? "a meal" : `${cap} meals`} you want delivered every day.
        </p>
      )}
    </div>
  );
}

/**
 * A safe default when nothing has been chosen yet: the last N of what the
 * provider offers, so a two-meal plan means the day's later meals rather than
 * a hard-coded lunch and dinner.
 */
export function defaultMealsForCount(mealsPerDay: number, items: ProviderItem[] = []): MealKey[] {
  const options = itemKeys(items);
  const n = Math.max(1, Math.min(mealsPerDay || 1, options.length));
  return options.slice(Math.max(0, options.length - n));
}
