import { useMemo, useState } from "react";
import { Flame, Check, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FoodMenuMeal, DayOfWeek, MealType } from "@/types/food";
import { DAYS_OF_WEEK, MEAL_TYPE_LABELS } from "@/types/food";
import { nowHN } from "@/lib/timezone";

// Short day labels for the horizontal picker (Пн / Вт / … pattern from Yandex).
const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

/** Returns the Date for a given day-of-week inside the same week as `ref` (week starts Monday). */
function dateForDay(ref: Date, day: DayOfWeek): Date {
  const dayIndex = DAYS_OF_WEEK.indexOf(day); // 0 = mon … 6 = sun
  // JS getDay: 0=Sun, 1=Mon … convert so Mon = 0
  const refIndex = (ref.getDay() + 6) % 7;
  const diff = dayIndex - refIndex;
  const d = new Date(ref);
  d.setDate(d.getDate() + diff);
  return d;
}

/** Which day of week is `today` in Honduras timezone. */
function todayDayOfWeek(): DayOfWeek {
  const t = nowHN();
  return DAYS_OF_WEEK[(t.getDay() + 6) % 7];
}

interface Props {
  meals: FoodMenuMeal[];
  mealTypes: MealType[];
  weekStartDate: string;
}

/**
 * Yandex Lavka «Мой рацион питания»-style view of the current week's meals.
 * Horizontal day-strip at the top with past/today indicators, then a stacked
 * list of meal-type cards for the selected day: each card has the meal name,
 * total kcal pill, and a row of circular dish thumbnails.
 *
 * Purposefully lighter than {@link WeeklyMenuDisplay} — that one shows the
 * entire week at once for the *plan detail* / admin preview, while this view is
 * optimised for the "what am I eating today" subscription screen.
 */
export function MyRationView({ meals, mealTypes, weekStartDate }: Props) {
  const today = todayDayOfWeek();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(today);

  const weekRef = useMemo(() => {
    if (!weekStartDate) return nowHN();
    return new Date(`${weekStartDate}T00:00:00`);
  }, [weekStartDate]);

  // Group meals: day → meal_type → dishes
  const byDay = useMemo(() => {
    const map: Partial<Record<DayOfWeek, Partial<Record<MealType, FoodMenuMeal[]>>>> = {};
    meals.forEach((m) => {
      if (!mealTypes.includes(m.meal_type)) return;
      if (!map[m.day_of_week]) map[m.day_of_week] = {};
      const t = map[m.day_of_week]!;
      if (!t[m.meal_type]) t[m.meal_type] = [];
      t[m.meal_type]!.push(m);
    });
    return map;
  }, [meals, mealTypes]);

  const todayIdx = DAYS_OF_WEEK.indexOf(today);
  const dayMeals = byDay[selectedDay] ?? {};

  return (
    <div className="space-y-4">
      {/* ── Day strip ─────────────────────────────────────────────────────── */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-2 pb-1">
          {DAYS_OF_WEEK.map((day, i) => {
            const selected = day === selectedDay;
            const isToday = day === today;
            const isPast = i < todayIdx;
            const dayDate = dateForDay(weekRef, day);
            const dayHasContent =
              (byDay[day] && Object.values(byDay[day]!).some((arr) => arr && arr.length > 0)) ?? false;

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                aria-pressed={selected}
                aria-label={`${DAY_SHORT[day]} ${dayDate.getDate()}${isToday ? " today" : ""}`}
                className={cn(
                  "flex min-w-[60px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 transition-colors",
                  selected
                    ? "bg-foreground text-background"
                    : "bg-card text-foreground hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full",
                    selected
                      ? "bg-background/20"
                      : dayHasContent && isPast
                        ? "bg-emerald-500 text-white"
                        : isToday
                          ? "bg-primary text-primary-foreground"
                          : "border border-border",
                  )}
                >
                  {dayHasContent && isPast && !selected ? (
                    <Check className="h-2.5 w-2.5" strokeWidth={4} />
                  ) : null}
                </span>
                <span className={cn("text-[10px] font-bold uppercase tracking-wider", selected ? "opacity-80" : "text-muted-foreground")}>
                  {DAY_SHORT[day]}
                </span>
                <span className={cn("text-sm font-black leading-none tabular-nums", !selected && "text-foreground")}>
                  {dayDate.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Meal cards for the selected day ──────────────────────────────── */}
      <div className="overflow-hidden rounded-3xl bg-card">
        {mealTypes.map((type, i) => {
          const dishes = dayMeals[type] ?? [];
          const totalKcal = dishes.reduce((sum, m) => sum + (m.calories ?? 0), 0);
          const isEmpty = dishes.length === 0;

          return (
            <div
              key={type}
              className={cn(
                "px-5 py-4",
                i > 0 && "border-t border-border/40",
              )}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-black tracking-tight text-foreground">
                    {MEAL_TYPE_LABELS[type]}
                  </h3>
                  {totalKcal > 0 && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-400">
                      <Flame className="h-3 w-3" />
                      {totalKcal} kcal
                    </span>
                  )}
                </div>
              </div>

              {/* Dishes */}
              {isEmpty ? (
                <p className="mt-3 rounded-2xl bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
                  No dishes planned
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {/* Circular thumbnails row */}
                  <div className="flex flex-wrap gap-2">
                    {dishes.map((meal) => (
                      <div
                        key={meal.id}
                        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
                        title={meal.meal_name}
                      >
                        {meal.image_url ? (
                          <img
                            src={meal.image_url}
                            alt={meal.meal_name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <UtensilsCrossed className="h-6 w-6 text-muted-foreground/50" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Dish names list */}
                  <ul className="mt-1 space-y-0.5">
                    {dishes.map((meal) => (
                      <li key={`${meal.id}-name`} className="text-sm text-foreground">
                        <span className="font-medium">{meal.meal_name}</span>
                        {meal.meal_description && (
                          <span className="text-muted-foreground">
                            {" · "}
                            {meal.meal_description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
