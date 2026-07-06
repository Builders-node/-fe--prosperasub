/**
 * Shared weekly-menu renderer used by:
 *   - FoodPlanDetail (public customer view)
 *   - MenuPreview inside FoodMenus admin (admin preview)
 */
import { Coffee, Sun, Moon, Apple, UtensilsCrossed, Flame, CalendarDays } from "lucide-react";
import type { FoodMenuMeal, DayOfWeek, MealType } from "@/types/food";
import { DAY_LABELS, DAYS_OF_WEEK, MEAL_TYPE_LABELS } from "@/types/food";
import { formatWeekLabel } from "@/lib/foodUtils";

const MEAL_TYPE_META: Record<MealType, { icon: React.ReactNode; color: string; bg: string }> = {
  breakfast: { icon: <Coffee  className="h-4 w-4" />, color: "text-amber-400",  bg: "bg-amber-500/10"  },
  lunch:     { icon: <Sun     className="h-4 w-4" />, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  dinner:    { icon: <Moon    className="h-4 w-4" />, color: "text-indigo-400", bg: "bg-indigo-500/10" },
  snack:     { icon: <Apple   className="h-4 w-4" />, color: "text-green-400",  bg: "bg-green-500/10"  },
  other:     { icon: <UtensilsCrossed className="h-4 w-4" />, color: "text-muted-foreground", bg: "bg-muted" },
  meal:      { icon: <UtensilsCrossed className="h-4 w-4" />, color: "text-muted-foreground", bg: "bg-muted" },
};

interface WeeklyMenuDisplayProps {
  meals: FoodMenuMeal[];
  mealTypes: MealType[];
  weekStartDate: string;
  /** When true, show all 7 days regardless of content */
  showEmptyDays?: boolean;
}

export function WeeklyMenuDisplay({
  meals,
  mealTypes,
  weekStartDate,
  showEmptyDays = false,
}: WeeklyMenuDisplayProps) {
  // Group meals: day → mealType → items
  const byDay: Partial<Record<DayOfWeek, Partial<Record<MealType, FoodMenuMeal[]>>>> = {};
  meals.forEach((m) => {
    if (!mealTypes.includes(m.meal_type)) return; // skip meal types not in this plan
    if (!byDay[m.day_of_week]) byDay[m.day_of_week] = {};
    const t = byDay[m.day_of_week]!;
    if (!t[m.meal_type]) t[m.meal_type] = [];
    t[m.meal_type]!.push(m);
  });

  const activeDays = DAYS_OF_WEEK.filter((d) =>
    showEmptyDays || (byDay[d] && Object.values(byDay[d]!).some((arr) => arr && arr.length > 0)),
  );

  if (activeDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card py-14 text-center">
        <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-semibold text-foreground">No menu published yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This week&apos;s menu is being finalised — check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeDays.map((day) => {
        const typeMap = byDay[day] ?? {};
        const hasMeals = Object.values(typeMap).some((arr) => arr && arr.length > 0);

        return (
          <div key={day} className="overflow-hidden rounded-2xl border border-border bg-card">
            {/* Day header */}
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
                {DAY_LABELS[day]}
              </h3>
            </div>

            {hasMeals ? (
              <div className="flex flex-col divide-y divide-border/60 md:flex-row md:divide-x md:divide-y-0">
                {mealTypes.map((type) => {
                  const dishes = typeMap[type] ?? [];
                  const meta = MEAL_TYPE_META[type];
                  return (
                    <div key={type} className="flex-1 px-4 py-3">
                      {/* Meal type header */}
                      <div className={`inline-flex items-center gap-1.5 rounded-full ${meta.bg} px-3 py-1 mb-3`}>
                        <span className={meta.color}>{meta.icon}</span>
                        <span className={`text-xs font-bold ${meta.color}`}>
                          {MEAL_TYPE_LABELS[type]}
                        </span>
                      </div>

                      {dishes.length > 0 ? (
                        <ul className="space-y-2">
                          {dishes.map((meal) => (
                            <li key={meal.id} className="overflow-hidden rounded-2xl bg-muted/30">
                              {meal.image_url && (
                                <img
                                  src={meal.image_url}
                                  alt={meal.meal_name}
                                  loading="lazy"
                                  decoding="async"
                                  className="aspect-[16/9] w-full object-cover"
                                />
                              )}
                              <div className="px-3 py-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-foreground">
                                    {meal.meal_name}
                                  </span>
                                  {meal.calories && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                                      <Flame className="h-3 w-3" />
                                      {meal.calories} kcal
                                    </span>
                                  )}
                                </div>
                                {meal.meal_description && (
                                  <p className="mt-0.5 text-sm text-muted-foreground">
                                    {meal.meal_description}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic">Not set</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground/50 italic">No meals planned</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
