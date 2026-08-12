import { CalendarDays, ChefHat, UtensilsCrossed } from "lucide-react";
import { PlanCard, type PlanCardRating } from "@/components/patterns/PlanCard";
import { dietaryTagMeta } from "@/lib/foodDietaryTags";
import { cn } from "@/lib/utils";
import type { FoodMealPlan } from "@/types/food";

/**
 * A `food_meal_plans` row as a plan card.
 *
 * This existed twice — once in the food listing and once on the restaurant
 * page — and the two had already drifted: only one showed dietary tags, only
 * one showed highlights, and they disagreed on the CTA. One card now, and the
 * page says which of the two contexts it is by whether it passes a provider
 * name for the eyebrow.
 */
export function MealPlanCard({
  plan,
  providerName,
  images = [],
  featured,
  rating,
  onOpen,
}: {
  plan: FoodMealPlan;
  /** Shown as the eyebrow on the cross-restaurant listing; omit on a restaurant's own page. */
  providerName?: string;
  images?: string[];
  featured?: boolean;
  rating?: PlanCardRating | null;
  onOpen: () => void;
}) {
  const tags = ((plan as any).dietary_tags ?? []) as string[];

  return (
    <PlanCard
      title={plan.name}
      eyebrow={providerName ? { icon: ChefHat, text: providerName } : undefined}
      description={plan.description}
      photos={images}
      rating={rating}
      featured={featured}
      badges={
        tags.length > 0
          ? tags.map((t) => {
              const meta = dietaryTagMeta(t);
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <span
                  key={t}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    meta.tint,
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
              );
            })
          : undefined
      }
      chips={[
        { icon: UtensilsCrossed, label: `${plan.meals_per_week} meals/week` },
        { icon: CalendarDays, label: `${plan.days_per_week} days/week` },
      ]}
      features={plan.highlights ?? []}
      price={{ cents: plan.weekly_price_cents, unit: "/ week" }}
      cta={{ label: "View menu", onClick: onOpen }}
      onOpen={onOpen}
    />
  );
}
