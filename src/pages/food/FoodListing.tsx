import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useArchetypeLabel } from "@/hooks/useServiceArchetypes";
import { useNavigate } from "react-router-dom";
import { ChefHat, MapPin } from "lucide-react";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { QueryError } from "@/components/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { useResidenceFilter } from "@/hooks/useResidenceFilter";
import { useProviderRatings } from "@/hooks/useProviderRatings";
import { usePlanOffers } from "@/hooks/usePlanOffers";
import { useListingSearch } from "@/hooks/useListingSearch";
import { ListingToolbar } from "@/components/listing/ListingToolbar";
import { MealPlanCard } from "@/components/food/MealPlanCard";
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
  const serviceTitle = useArchetypeLabel("food", "Food");

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

  // Categories under the Food archetype — grouping restaurants under their
  // category (Meal Subscription today; future: Catering, Grocery Delivery).
  // Header hides when only one category is populated so the page stays clean.
  const foodCategoriesQ = useQuery({
    queryKey: ["food-categories-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", "food")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; sort_order: number }>;
    },
  });

  // Bridge: get_food_catalog returns legacy food_providers.* (no category_key).
  // Hydrate the category from the universal `providers` row via source_provider_id
  // so category grouping works without touching the server-side RPC.
  const foodProviderCategoriesQ = useQuery({
    queryKey: ["food-provider-categories-map"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("category_key, source_provider_id")
        .eq("archetype_key", "food");
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (data ?? []).forEach((r: any) => {
        if (r.source_provider_id) map[String(r.source_provider_id)] = r.category_key ?? null;
      });
      return map;
    },
  });

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
  const { residence, servesHere, isFiltering } = useResidenceFilter();

  // Ratings belong to the restaurant, and the listing knows restaurants by
  // their legacy food_providers.id — the hook bridges to the universal id.
  const ratings = useProviderRatings((providers ?? []).map((p) => p.id), { legacyService: "food" });

  const visibleProviders = (providers ?? [])
    .filter((p) => servesHere(p.residenceIds))
    .map((p) => ({ ...p, plans: p.plans.filter((pl) => servesHere(pl.residenceIds)) }))
    .filter((p) => p.plans.length > 0 || (providers ?? []).find((o) => o.id === p.id)!.plans.length === 0);

  const hiddenCount = (providers ?? []).length - visibleProviders.length;

  // Group visible restaurants by category (Meal Subscription today; future:
  // Catering, Grocery Delivery). If only one category has content, the header
  // is hidden — page stays visually identical to before until an admin adds
  // a second Food category.
  const restaurantGroups = useMemo(
    () => groupProvidersByCategory(
      visibleProviders,
      foodCategoriesQ.data ?? [],
      // Food resolves the category through a join table, not a column.
      (p) => (foodProviderCategoriesQ.data ?? {})[p.id],
    ),
    [visibleProviders, foodCategoriesQ.data, foodProviderCategoriesQ.data],
  );

  // All meal plans across restaurants, flattened with their provider for context.
  // ── Providers rail + category chips (shared shape across all four
  //    listings — see components/listing/ListingNav) ──────────────────────
  const railProviders = useMemo(
    () => restaurantGroups.flatMap((g) =>
      g.providers.map((p: any) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.logo_url ?? p.avatar_url ?? null,
        gallery: (p.images ?? []).map((i: any) => i.url ?? i.image_url).filter(Boolean),
        meta: `${(p.plans ?? []).length} plan${(p.plans ?? []).length !== 1 ? "s" : ""}`,
      }))),
    [restaurantGroups],
  );
  const chipCategories = useMemo(
    () => restaurantGroups.map((g) => ({
      key: g.key,
      label: g.label,
      count: g.providers.reduce((n: number, p: any) => n + (p.plans ?? []).length, 0),
    })),
    [restaurantGroups],
  );
  const [activeCategory, setActiveCategory] = useCategoryParam();
  const visibleGroups = activeCategory === ALL_CATEGORIES
    ? restaurantGroups
    : restaurantGroups.filter((g) => g.key === activeCategory);
  /** Restaurant ids inside the chosen category — food plans carry their
   *  provider, so the chip narrows the plan list too. */
  const scopedProviderIds = useMemo(
    () => new Set(visibleGroups.flatMap((g) => g.providers.map((p: any) => p.id))),
    [visibleGroups],
  );

  /**
   * Plans that have collapsed into an offer show up once, not once per
   * combination. The card that survives is the cheapest variant — it carries
   * the "from" price the customer sees, and tapping it opens the plan screen
   * where the option chips switch between siblings.
   */
  const { offerBySourcePlanId } = usePlanOffers(
    (providers ?? []).map((p) => p.id),
    { legacyService: "food" },
  );

  const allPlans = visibleProviders
    .filter((p) => scopedProviderIds.size === 0 || scopedProviderIds.has(p.id))
    .flatMap((p) => p.plans.map((plan) => ({ plan, provider: p })))
    .filter(({ plan }) => {
      const offer = offerBySourcePlanId.get(String(plan.id));
      if (!offer) return true;                       // a plain plan, shown as-is
      const cheapest = offer.variants.reduce(
        (best, v) => (best === null || v.priceCents < best.priceCents ? v : best),
        null as null | { priceCents: number; sourcePlanId: string | null },
      );
      return cheapest?.sourcePlanId === String(plan.id);
    });

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

  const search = useListingSearch(filteredPlans, {
    text: ({ plan, provider }) => [
      plan.name, plan.description, provider.name,
      ...(((plan as any).dietary_tags ?? []) as string[]),
      ...((plan.highlights ?? []) as string[]),
    ],
    price: ({ plan }) => plan.weekly_price_cents,
    rating: ({ provider }) => ratings[provider.id]?.average ?? null,
    name: ({ plan }) => plan.name,
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title={serviceTitle} showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-space-4 md:py-space-8">

        {/* ─── Providers → Categories → the list ───────────────────── */}
        {!isLoading && !isError && railProviders.length > 0 && (
          <div className="mb-6 space-y-4">
            <ProviderRail
              providers={railProviders}
              icon={ChefHat}
              label="Restaurants"
              onOpen={(id) => navigate(`/services/food/${id}`)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <CategoryChips categories={chipCategories} value={activeCategory} onChange={setActiveCategory} />
              {isFiltering && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <MapPin className="h-3.5 w-3.5" /> {residence}
                </span>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="mb-6 flex gap-3">
            {[1, 2].map((i) => <div key={i} className="h-28 w-[260px] shrink-0 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : isError ? (
          <div className="mb-6">
            <QueryError
              title="Couldn't load restaurants"
              error={error instanceof Error ? error.message : undefined}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          </div>
        ) : visibleProviders.length === 0 ? (
          <div className="mb-6">
            {isFiltering ? (
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
          </div>
        ) : hiddenCount > 0 ? (
          <p className="mb-6 text-center text-xs text-muted-foreground">
            {hiddenCount} restaurant{hiddenCount > 1 ? "s" : ""} not available in {residence}
          </p>
        ) : null}

        {/* ─── Meal Plans ──────────────────────────────────────────── */}
        {allPlans.length > 0 && (
          <>
            <h2 className="mb-3 mt-space-8 text-xl font-black tracking-tight text-foreground">
              Meal Plans
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({dietaryFilter || search.isActive ? search.results.length : allPlans.length})
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

            <ListingToolbar
              query={search.query}
              onQueryChange={search.setQuery}
              sort={search.sort}
              onSortChange={search.setSort}
              sorts={search.availableSorts}
              placeholder="Search meal plans"
              resultCount={search.results.length}
              className="mb-4"
            />

            {search.results.length > 0 ? (
              <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {search.results.map(({ plan, provider }) => (
                  <MealPlanCard
                    key={plan.id}
                    plan={plan}
                    providerName={provider.name}
                    images={planImages[plan.id] ?? []}
                    rating={ratings[provider.id]}
                    offer={offerBySourcePlanId.get(String(plan.id)) ?? null}
                    onOpen={() => navigate(`/services/food/${provider.id}/plans/${plan.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {search.query.trim()
                    ? "No plans match your search — try another word."
                    : "No plans match this filter — try another diet."}
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

export default FoodListing;
