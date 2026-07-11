import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  UtensilsCrossed, ChefHat, MapPin, ArrowRight, CalendarDays,
} from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { QueryError } from "@/components/QueryError";
import { formatUSD } from "@/lib/pricing";
import {
  YdChip, YdEmptyState,
} from "@/components/yd/YdPrimitives";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { useResidences } from "@/hooks/useResidences";
import type { FoodProvider, FoodMealPlan } from "@/types/food";
import { DIETARY_TAGS, dietaryTagMeta, type DietaryTag } from "@/lib/foodDietaryTags";
import { cn } from "@/lib/utils";

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

  // Single-RPC catalog fetch — replaces the previous 6-query waterfall
  // (providers → plans → provider_residences + plan_residences → reviews →
  // weekly_menus → menu_meals). Server-side aggregation, one round trip.
  const catalog = useQuery({
    queryKey: ["food-catalog-rpc"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.rpc("get_food_catalog");
      if (error) throw error;
      return (data ?? {}) as {
        providers: FoodProvider[];
        plans: FoodMealPlan[];
        provider_residences: { provider_id: string; residence_id: string }[];
        plan_residences: { meal_plan_id: string; residence_id: string }[];
        ratings: { provider_id: string; avg_rating: number; review_count: number }[];
        plan_images: { meal_plan_id: string; urls: string[] }[];
      };
    },
  });
  const { isLoading, isError, error, refetch, isFetching } = catalog;

  // Reshape the flat RPC payload into the previous ProviderWithPlans[] contract
  // so the rest of the render code is unchanged.
  const providers = useMemo<ProviderWithPlans[] | undefined>(() => {
    if (!catalog.data) return undefined;
    const c = catalog.data;

    const provRes: Record<string, string[]> = {};
    c.provider_residences.forEach((r) => { (provRes[r.provider_id] ??= []).push(r.residence_id); });

    const planRes: Record<string, string[]> = {};
    c.plan_residences.forEach((r) => { (planRes[r.meal_plan_id] ??= []).push(r.residence_id); });

    const plansMap: Record<string, PlanWithResidences[]> = {};
    c.plans.forEach((p) => { (plansMap[p.provider_id] ??= []).push({ ...p, residenceIds: planRes[p.id] ?? [] }); });

    const ratingsMap: Record<string, { avg: number; count: number }> = {};
    c.ratings.forEach((r) => { ratingsMap[r.provider_id] = { avg: r.avg_rating, count: r.review_count }; });

    return c.providers.map((p) => {
      const plans = plansMap[p.id] ?? [];
      const minPrice = plans.length > 0 ? Math.min(...plans.map((pl) => pl.weekly_price_cents)) : null;
      const rating = ratingsMap[p.id];
      return {
        ...p,
        plans,
        residenceIds: provRes[p.id] ?? [],
        minPrice,
        rating: rating?.avg ?? null,
        reviewCount: rating?.count ?? 0,
      };
    });
  }, [catalog.data]);

  const planImages = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    catalog.data?.plan_images.forEach((row) => { map[row.meal_plan_id] = row.urls; });
    return map;
  }, [catalog.data]);

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

  // Dietary filter — customer taps Keto → we hide plans without that tag.
  // Only surface filter chips for tags at least one plan actually carries; a
  // filter row filled with unavailable options is pure clutter.
  const [dietaryFilter, setDietaryFilter] = useState<DietaryTag | null>(null);
  const availableTags = useMemo<DietaryTag[]>(() => {
    const seen = new Set<string>();
    allPlans.forEach(({ plan }) => {
      const tags = (plan as any).dietary_tags as string[] | null | undefined;
      tags?.forEach((t) => { if (dietaryTagMeta(t)) seen.add(t); });
    });
    // Preserve canonical order from the registry so chips don't reshuffle when
    // a provider adds a new plan.
    return (Object.keys(DIETARY_TAGS) as DietaryTag[]).filter((k) => seen.has(k));
  }, [allPlans]);

  const filteredPlans = dietaryFilter
    ? allPlans.filter(({ plan }) => {
        const tags = ((plan as any).dietary_tags ?? []) as string[];
        return tags.includes(dietaryFilter);
      })
    : allPlans;

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
        ) : isError ? (
          <QueryError
            title="Couldn't load restaurants"
            error={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : visibleProviders.length > 0 ? (
          <>
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            {visibleProviders.map((p) => (
              <RestaurantCard
                key={p.id}
                provider={p}
                onClick={() => navigate(`/services/food/${p.id}`)}
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
            title="No restaurants yet"
            subtitle="We're setting things up. Check back soon."
          />
        )}

        {/* ─── Meal Plans ──────────────────────────────────────────── */}
        {allPlans.length > 0 && (
          <>
            <h2 className="mb-3 mt-space-8 text-xl font-black tracking-tight text-foreground">
              Meal Plans
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({dietaryFilter ? filteredPlans.length : allPlans.length})
              </span>
            </h2>

            {/* Dietary filter row — only shown when at least one plan carries
                a tag. "All" resets. Horizontally scrollable on narrow screens
                so long tag lists don't wrap into two rows. */}
            {availableTags.length > 0 && (
              <div className="mb-4 -mx-4 overflow-x-auto px-4">
                <div className="flex gap-1.5 pb-1">
                  <button
                    type="button"
                    onClick={() => setDietaryFilter(null)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      dietaryFilter === null
                        ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All
                  </button>
                  {availableTags.map((key) => {
                    const meta = DIETARY_TAGS[key];
                    const Icon = meta.icon;
                    const on = dietaryFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDietaryFilter(on ? null : key)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                          on
                            ? `${meta.tint} ring-1 ring-primary/40`
                            : "bg-muted/40 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredPlans.length > 0 ? (
              <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredPlans.map(({ plan, provider }) => (
                  <MealPlanCard
                    key={plan.id}
                    plan={plan}
                    providerName={provider.name}
                    images={planImages[plan.id] ?? []}
                    onClick={() => navigate(`/services/food/${provider.id}/plans/${plan.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No plans match this filter — try another diet.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

// ─── Restaurant card ─────────────────────────────────────────────────────────
// Solid-colour block matching the other simplified provider tiles (cleaning /
// rental / entertainment). Tap → full provider detail page.
function RestaurantCard({
  provider,
  onClick,
}: {
  provider: ProviderWithPlans;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-28 items-center justify-center rounded-3xl border border-border bg-card px-6 text-center transition-colors hover:border-primary/40"
    >
      <span className="text-2xl font-black tracking-tight text-foreground">
        {provider.name}
      </span>
    </button>
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

      {/* Dietary tags — colored soft pills, only rendered when present. Gives
          the plan card an at-a-glance identity ("Keto", "Vegan") next to the
          neutral quantity chips underneath. */}
      {(() => {
        const tags = ((plan as any).dietary_tags ?? []) as string[];
        if (tags.length === 0) return null;
        return (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => {
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
            })}
          </div>
        );
      })()}

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
