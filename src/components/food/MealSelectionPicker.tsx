import { Coffee, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The three canonical meal keys. Ordering matches how a day naturally reads
 * (morning → evening) so `sortMeals` produces the same order everywhere.
 */
export const MEAL_KEYS = ["breakfast", "lunch", "dinner"] as const;
export type MealKey = (typeof MEAL_KEYS)[number];

const MEAL_META: Record<MealKey, { label: string; icon: typeof Coffee }> = {
  breakfast: { label: "Breakfast", icon: Coffee },
  lunch:     { label: "Lunch",     icon: Sun },
  dinner:    { label: "Dinner",    icon: Moon },
};

/** Sort by canonical day order so [dinner, breakfast] renders as [breakfast, dinner]. */
export function sortMeals(meals: MealKey[]): MealKey[] {
  return [...meals].sort((a, b) => MEAL_KEYS.indexOf(a) - MEAL_KEYS.indexOf(b));
}

/** Human-readable summary — "Breakfast · Lunch" or "Lunch" or "—" (empty). */
export function formatMeals(meals: string[] | null | undefined): string {
  if (!meals?.length) return "—";
  const valid = meals.filter((m): m is MealKey => (MEAL_KEYS as readonly string[]).includes(m));
  return sortMeals(valid).map((m) => MEAL_META[m].label).join(" · ");
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
  disabled,
}: {
  value: MealKey[];
  onChange: (next: MealKey[]) => void;
  mealsPerDay: number;
  disabled?: boolean;
}) {
  const selected = new Set(value);
  const cap = Math.max(1, Math.min(mealsPerDay, MEAL_KEYS.length));
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
    onChange(sortMeals(Array.from(next)));
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

      <div className="grid grid-cols-3 gap-2">
        {MEAL_KEYS.map((meal) => {
          const meta = MEAL_META[meal];
          const on = selected.has(meal);
          const Icon = meta.icon;
          return (
            <button
              key={meal}
              type="button"
              onClick={() => toggle(meal)}
              disabled={disabled}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4 transition-colors",
                on
                  ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
              aria-pressed={on}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{meta.label}</span>
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

/** Convenience — safe default when no explicit selection exists. */
export function defaultMealsForCount(mealsPerDay: number): MealKey[] {
  if (mealsPerDay >= 3) return ["breakfast", "lunch", "dinner"];
  if (mealsPerDay === 2) return ["lunch", "dinner"];
  return ["lunch"];
}
