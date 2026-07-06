import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  UtensilsCrossed, ChefHat, MapPin, Clock, ArrowRight, BookOpen, Star, CalendarDays,
} from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatWorkingHours } from "@/lib/workingHours";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { formatUSD } from "@/lib/pricing";
import {
  YdIllustration, YdChip, YdEmptyState,
} from "@/components/yd/YdPrimitives";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { useResidences } from "@/hooks/useResidences";
import type { FoodProvider, FoodMealPlan } from "@/types/food";

type PlanWithResidences = FoodMealPlan & { residenceIds: string[] };
type ProviderWithPlans = FoodProvider & {
  plans: PlanWithResidences[];
  residenceIds: string[];
  minPrice: number | null;
  rating: number | null;
  reviewCount: number;
};

const FoodListing = () => {
  const navigate = useNavigate();

  const { data: providers, isLoading } = useQuery({
    queryKey: ["food-providers-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_providers")
        .select("*")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const list = (data ?? []) as FoodProvider[];
      if (list.length === 0) return [] as ProviderWithPlans[];

      const ids = list.map((p) => p.id);
      const { data: plansData } = await supabaseDb
        .from("food_meal_plans")
        .select("*")
        .in("provider_id", ids)
        .eq("status", "active")
        .order("sort_order", { ascending: true });

      // Location scoping: which residences each provider serves and each plan
      // is offered in. Empty list = available everywhere.
      const planIds = (plansData ?? []).map((p: FoodMealPlan) => p.id);
      const [{ data: provLinks }, { data: planLinks }] = await Promise.all([
        supabaseDb.from("food_provider_residences").select("provider_id, residence_id").in("provider_id", ids),
        planIds.length
          ? supabaseDb.from("food_meal_plan_residences").select("meal_plan_id, residence_id").in("meal_plan_id", planIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const provResidences: Record<string, string[]> = {};
      (provLinks ?? []).forEach((l: any) => { (provResidences[l.provider_id] ??= []).push(l.residence_id); });
      const planResidences: Record<string, string[]> = {};
      (planLinks ?? []).forEach((l: any) => { (planResidences[l.meal_plan_id] ??= []).push(l.residence_id); });

      const plansMap: Record<string, PlanWithResidences[]> = {};
      (plansData ?? []).forEach((plan: FoodMealPlan) => {
        if (!plansMap[plan.provider_id]) plansMap[plan.provider_id] = [];
        plansMap[plan.provider_id].push({ ...plan, residenceIds: planResidences[plan.id] ?? [] });
      });

      // Aggregate review ratings per provider.
      const { data: reviewRows } = await supabaseDb
        .from("food_reviews")
        .select("provider_id, rating")
        .in("provider_id", ids);
      const ratingAgg: Record<string, { sum: number; count: number }> = {};
      (reviewRows ?? []).forEach((r: { provider_id: string; rating: number }) => {
        const a = (ratingAgg[r.provider_id] ??= { sum: 0, count: 0 });
        a.sum += r.rating;
        a.count += 1;
      });

      return list.map((p) => {
        const plans = plansMap[p.id] ?? [];
        const minPrice = plans.length > 0
          ? Math.min(...plans.map((pl) => pl.weekly_price_cents))
          : null;
        const agg = ratingAgg[p.id];
        return {
          ...p,
          plans,
          residenceIds: provResidences[p.id] ?? [],
          minPrice,
          rating: agg ? agg.sum / agg.count : null,
          reviewCount: agg?.count ?? 0,
        };
      }) as ProviderWithPlans[];
    },
  });

  // Meal photos for every plan (across all restaurants), keyed by plan id.
  const { data: planImages = {} } = useQuery({
    queryKey: ["food-all-plan-meal-images"],
    queryFn: async () => {
      const { data: menus } = await supabaseDb
        .from("food_weekly_menus")
        .select("id, meal_plan_id");
      const menuIds = (menus ?? []).map((m) => m.id);
      if (!menuIds.length) return {} as Record<string, string[]>;

      const { data: meals } = await supabaseDb
        .from("food_menu_meals")
        .select("menu_id, image_url, sort_order")
        .in("menu_id", menuIds)
        .not("image_url", "is", null)
        .order("sort_order", { ascending: true });

      const menuToPlan = new Map((menus ?? []).map((m) => [m.id, m.meal_plan_id]));
      const map: Record<string, string[]> = {};
      for (const meal of meals ?? []) {
        const url = (meal as any).image_url as string | null;
        const planId = menuToPlan.get((meal as any).menu_id);
        if (!url || !planId) continue;
        (map[planId] ??= []).push(url);
      }
      return map;
    },
  });

  // ── Location filter ──────────────────────────────────────────────────────
  const { residence } = useSelectedResidence();
  const { data: residences = [] } = useResidences();
  const selectedResidenceId = residence ? (residences.find((r) => r.name === residence)?.id ?? null) : null;
  // Empty link list = available everywhere; otherwise must include the selection.
  const servesHere = (ids: string[]) => !selectedResidenceId || ids.length === 0 || ids.includes(selectedResidenceId);

  const visibleProviders = (providers ?? [])
    .filter((p) => servesHere(p.residenceIds))
    .map((p) => ({ ...p, plans: p.plans.filter((pl) => servesHere(pl.residenceIds)) }))
    .filter((p) => p.plans.length > 0 || (providers ?? []).find((o) => o.id === p.id)!.plans.length === 0);

  const hiddenCount = (providers ?? []).length - visibleProviders.length;

  // All meal plans across restaurants, flattened with their provider for context.
  const allPlans = visibleProviders.flatMap((p) =>
    p.plans.map((plan) => ({ plan, provider: p })),
  );

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Food" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-space-4 md:py-space-8">

        {/* ─── Restaurants ─────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-black tracking-tight text-foreground">Restaurants</h2>
          {selectedResidenceId && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <MapPin className="h-3.5 w-3.5" /> {residence}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : visibleProviders.length > 0 ? (
          <>
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            {visibleProviders.map((p, idx) => (
              <RestaurantCard
                key={p.id}
                provider={p}
                featured={idx === 0 && visibleProviders.length > 1}
                onClick={() => navigate(`/food/${p.id}`)}
              />
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {hiddenCount} restaurant{hiddenCount > 1 ? "s" : ""} not available in {residence}
            </p>
          )}
          </>
        ) : selectedResidenceId ? (
          <YdEmptyState
            icon={MapPin}
            title={`No restaurants in ${residence} yet`}
            subtitle="Try another location or check back soon."
          />
        ) : (
          <YdEmptyState
            icon={ChefHat}
            title="No restaurants available"
            subtitle="Check back soon — restaurants are being set up."
          />
        )}

        {/* ─── Meal Plans ──────────────────────────────────────────── */}
        {allPlans.length > 0 && (
          <>
            <h2 className="mb-4 mt-space-8 text-xl font-black tracking-tight text-foreground">
              Meal Plans
              <span className="ml-2 text-base font-normal text-muted-foreground">({allPlans.length})</span>
            </h2>
            <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {allPlans.map(({ plan, provider }) => (
                <MealPlanCard
                  key={plan.id}
                  plan={plan}
                  providerName={provider.name}
                  images={planImages[plan.id] ?? []}
                  onClick={() => navigate(`/food/${provider.id}/plans/${plan.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

// ─── Restaurant card ─────────────────────────────────────────────────────────
function RestaurantCard({
  provider,
  featured,
  onClick,
}: {
  provider: ProviderWithPlans;
  featured: boolean;
  onClick: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl
                  
                  transition-all duration-200 ease-out
                  motion-safe:hover:scale-[1.01] hover:border-primary/40
                  hover:
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                  ${featured ? "md:col-span-2" : ""}`}
    >
      {/* Banner image */}
      <div className={`relative w-full overflow-hidden bg-muted ${featured ? "h-44 md:h-56" : "h-36"}`}>
        {provider.banner_url ? (
          <img
            src={provider.banner_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center ">
            <YdIllustration icon={UtensilsCrossed} accent="amber" size="lg" />
          </div>
        )}
        {/* Plan count pill */}
        {provider.plans.length > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/85 px-2.5 py-1 text-xs font-black text-foreground backdrop-">
            <BookOpen className="h-3 w-3" />
            {provider.plans.length} plan{provider.plans.length !== 1 ? "s" : ""}
          </span>
        )}
        {/* Featured badge */}
        {featured && (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-black">
            Featured
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
            {provider.avatar_url ? (
              <img src={provider.avatar_url} alt={provider.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-primary/10">
                <ChefHat className="h-5 w-5 text-primary" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black tracking-tight text-foreground leading-tight">
              {provider.name}
            </h2>
            {provider.location && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" /> {provider.location}
              </p>
            )}
            {provider.reviewCount > 0 && (
              <p className="mt-0.5 flex items-center gap-1 text-xs">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-bold text-foreground">{provider.rating!.toFixed(1)}</span>
                <span className="text-muted-foreground">({provider.reviewCount})</span>
              </p>
            )}
          </div>
        </div>

        {provider.description && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{provider.description}</p>
        )}

        {/* Meta chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {provider.working_hours && (
            <YdChip icon={Clock} label={formatWorkingHours(provider.working_hours)} />
          )}
        </div>

        {/* Price + CTA bottom */}
        <div className="mt-4 flex items-end justify-between gap-3 pt-3 border-t border-border/60">
          <div className="flex items-baseline gap-1">
            {provider.minPrice !== null ? (
              <>
                <span className="text-xs text-muted-foreground">from</span>
                <span className="ml-1 text-2xl font-black tabular-nums text-foreground">
                  {formatUSD(provider.minPrice)}
                </span>
                <span className="text-xs text-muted-foreground">/wk</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Coming soon</span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-black
                           transition-transform duration-200 group-hover:translate-x-0.5">
            View plans
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Meal plan card ──────────────────────────────────────────────────────────
function MealPlanCard({
  plan,
  providerName,
  images = [],
  onClick,
}: {
  plan: FoodMealPlan;
  providerName: string;
  images?: string[];
  onClick: () => void;
}) {
  const photos = images.slice(0, 3);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      className="group flex cursor-pointer flex-col rounded-3xl bg-card p-5 transition-all duration-200
                 motion-safe:hover:scale-[1.01] hover:border-primary/40
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Meal photos */}
      {photos.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-1.5">
          {photos.map((url, i) => (
            <div
              key={i}
              className={`relative aspect-square overflow-hidden rounded-xl bg-muted ${photos.length === 1 ? "col-span-3 aspect-[16/9]" : ""}`}
            >
              <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              {i === 2 && images.length > 3 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
                  +{images.length - 3}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
        <ChefHat className="h-3 w-3" /> {providerName}
      </p>
      <h3 className="mt-1 text-lg font-black tracking-tight text-foreground leading-tight">
        {plan.name}
      </h3>
      {plan.description && (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{plan.description}</p>
      )}

      {/* Spec chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        <YdChip icon={UtensilsCrossed} label={`${plan.meals_per_week} meals/week`} />
        <YdChip icon={CalendarDays} label={`${plan.days_per_week} days/week`} />
      </div>

      {/* Price + CTA */}
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-border/60 pt-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black tabular-nums text-foreground">
            {formatUSD(plan.weekly_price_cents)}
          </span>
          <span className="text-xs text-muted-foreground">/wk</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-black
                         transition-transform duration-200 group-hover:translate-x-0.5">
          View menu
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </article>
  );
}

export default FoodListing;
