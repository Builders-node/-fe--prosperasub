import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ChefHat, UtensilsCrossed, CalendarDays, Truck, Check, MapPin, Clock, Star } from "lucide-react";
import { formatWorkingHours } from "@/lib/workingHours";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { FoodReviews } from "@/components/food/FoodReviews";
import { StarRating } from "@/components/food/StarRating";
import { useResidenceFilter } from "@/hooks/useResidenceFilter";
import { MealPlanCard } from "@/components/food/MealPlanCard";
import type { FoodProvider, FoodMealPlan, FoodProviderImage, FoodReview } from "@/types/food";

const FoodProviderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: provider, isLoading: loadingProvider } = useQuery({
    queryKey: ["food-provider", id],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_providers")
        .select("*")
        .eq("id", id!)
        .eq("status", "active")
        .single();
      if (error) throw error;
      return data as FoodProvider;
    },
    enabled: !!id,
  });

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["food-meal-plans", id],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plans")
        .select("*")
        .eq("provider_id", id!)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const list = (data ?? []) as FoodMealPlan[];
      // Attach per-plan location availability (empty = everywhere).
      const planIds = list.map((p) => p.id);
      const { data: links } = planIds.length
        ? await supabaseDb.from("food_meal_plan_residences").select("meal_plan_id, residence_id").in("meal_plan_id", planIds)
        : { data: [] as any[] };
      const byPlan: Record<string, string[]> = {};
      (links ?? []).forEach((l: any) => { (byPlan[l.meal_plan_id] ??= []).push(l.residence_id); });
      return list.map((p) => ({ ...p, residenceIds: byPlan[p.id] ?? [] })) as (FoodMealPlan & { residenceIds: string[] })[];
    },
    enabled: !!id,
  });

  // Filter plans by the globally-selected location.
  const { residence, servesHere, isFiltering } = useResidenceFilter();
  const visiblePlans = plans.filter((p) => servesHere((p as any).residenceIds));

  // Meal photos for each plan — pulled from this provider's weekly menus, keyed by plan id.
  const { data: planImages = {} } = useQuery({
    queryKey: ["food-plan-meal-images", id],
    queryFn: async () => {
      const { data: menus } = await supabaseDb
        .from("food_weekly_menus")
        .select("id, meal_plan_id, hide_dishes")
        .eq("provider_id", id!);
      // A hidden week's dish PHOTOS give the dish away just as well as its
      // name, so those menus contribute nothing to the plan-card imagery.
      const menuIds = (menus ?? []).filter((m: any) => !m.hide_dishes).map((m) => m.id);
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
    enabled: !!id,
  });

  const { data: gallery = [] } = useQuery({
    queryKey: ["food-provider-images", id],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_provider_images")
        .select("*")
        .eq("provider_id", id!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FoodProviderImage[];
    },
    enabled: !!id,
  });

  /**
   * The rating shown at the top of the page.
   *
   * `id` is the LEGACY food_providers id; reviews live in `provider_reviews`
   * keyed by the universal one, so this bridges before counting. It used to
   * read `food_reviews`, which meant this header and the reviews list below it
   * could disagree — and after the ratings were unified it would have shown
   * "No reviews" over a list of them.
   */
  const { data: reviewStats } = useQuery({
    queryKey: ["food-provider-rating", id],
    queryFn: async () => {
      const { data: prov } = await supabaseDb
        .from("providers").select("id")
        .eq("source_service_key", "food").eq("source_provider_id", id!)
        .maybeSingle();
      const universalId = (prov as { id?: string } | null)?.id;
      if (!universalId) return { count: 0, avg: 0 };

      const { data, error } = await supabaseDb
        .from("provider_reviews")
        .select("rating")
        .eq("provider_id", universalId);
      if (error) throw error;
      const rows = (data ?? []) as Pick<FoodReview, "rating">[];
      const count = rows.length;
      const avg = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
      return { count, avg };
    },
    enabled: !!id,
  });

  if (loadingProvider) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Food" showBackButton onBack={() => navigate("/services/food")} />
        <DesktopHeader />
        <main className="market-content py-space-6 space-y-4">
          <div className="h-48 animate-pulse rounded-3xl bg-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          <div className="h-64 animate-pulse rounded-3xl bg-muted" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Food" showBackButton onBack={() => navigate("/services/food")} />
        <DesktopHeader />
        <main className="market-content flex flex-col items-center justify-center py-16">
          <ChefHat className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Restaurant not found</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const fromPrice = visiblePlans.length
    ? Math.min(...visiblePlans.map((p) => p.weekly_price_cents))
    : provider.weekly_price_cents;
  const maxMeals = visiblePlans.length
    ? Math.max(...visiblePlans.map((p) => p.meals_per_week))
    : provider.meals_per_week;
  const ratingCount = reviewStats?.count ?? 0;
  const ratingAvg = reviewStats?.avg ?? 0;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title={provider.name} showBackButton onBack={() => navigate("/services/food")} />
      <DesktopHeader />

      {/* ─── Full-width banner ───────────────────────────────────────────── */}
      <div className="relative h-52 w-full overflow-hidden bg-muted/30 md:h-72">
        {provider.banner_url ? (
          <img src={provider.banner_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <UtensilsCrossed className="h-20 w-20 text-muted-foreground/15" />
          </div>
        )}
      </div>

      <main className="market-content py-space-6 md:py-space-12 space-y-space-8">

        {/* ─── Product header (below banner) ───────────────────────────────── */}
        <section className="rounded-3xl bg-card p-5 md:p-7">
          {/* Icon + title */}
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.4rem] border border-border bg-muted md:h-24 md:w-24">
              {provider.avatar_url ? (
                <img
                  src={provider.avatar_url}
                  alt={provider.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-primary/10">
                  <ChefHat className="h-9 w-9 text-primary" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black leading-tight tracking-tight md:text-3xl">
                {provider.name}
              </h1>
              {provider.location && (
                <p className="mt-1 truncate text-sm text-muted-foreground">{provider.location}</p>
              )}
            </div>
          </div>

          {provider.description && (
            <p className="mt-4 text-body text-muted-foreground">{provider.description}</p>
          )}
        </section>

        {/* ─── Stats strip ─────────────────────────────────────────────────── */}
        <section className="grid grid-cols-4 divide-x divide-border rounded-3xl bg-card py-4">
          <Stat
            label={ratingCount ? `${ratingCount} ${ratingCount === 1 ? "Rating" : "Ratings"}` : "Ratings"}
            value={
              ratingCount ? (
                <span className="inline-flex items-baseline gap-1">
                  {ratingAvg.toFixed(1)}
                  <Star className="h-4 w-4 translate-y-px fill-current" />
                </span>
              ) : (
                "New"
              )
            }
            sub={ratingCount ? <StarRating value={ratingAvg} size={11} /> : "No reviews"}
          />
          <Stat label="Plans" value={String(visiblePlans.length || 0)} sub="Available" />
          <Stat label="Per Week" value={String(maxMeals)} sub="Meals" />
          <Stat label="From" value={`$${Math.round(fromPrice / 100)}`} sub="/ week" />
        </section>

        {/* ─── Gallery carousel (App Store screenshots) ──────────────────────
            Merges two sources: legacy `food_provider_images` rows (early food
            uploads) + the new `food_providers.gallery_urls` array populated
            via the shared GalleryField editor. Both paths keep working so we
            don't have to migrate existing food_provider_images data. */}
        {(() => {
          const legacyUrls = gallery.map((img) => img.url).filter(Boolean);
          const newUrls = Array.isArray(provider.gallery_urls)
            ? provider.gallery_urls.filter(Boolean)
            : [];
          // Dedupe preserving order — legacy first (they were curated with
          // sort_order), new appended.
          const seen = new Set<string>();
          const merged: string[] = [];
          [...legacyUrls, ...newUrls].forEach((url) => {
            if (!seen.has(url)) { seen.add(url); merged.push(url); }
          });
          if (merged.length === 0) return null;
          return (
            <section>
              <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
                {merged.map((url) => (
                  <div
                    key={url}
                    className="aspect-[3/4] w-56 shrink-0 snap-start overflow-hidden rounded-3xl bg-muted md:w-64"
                  >
                    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* ─── Meal Plans ──────────────────────────────────────────────────── */}
        <section id="meal-plans" className="scroll-mt-24">
          <h2 className="mb-4 flex flex-wrap items-center gap-2 text-xl font-black tracking-tight">
            Meal Plans
            {visiblePlans.length > 0 && (
              <span className="text-base font-normal text-muted-foreground">({visiblePlans.length})</span>
            )}
            {isFiltering && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <MapPin className="h-3.5 w-3.5" /> {residence}
              </span>
            )}
          </h2>

          {loadingPlans ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : visiblePlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-14 text-center">
              <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-semibold text-foreground">
                {isFiltering && plans.length > 0 ? `No plans in ${residence}` : "No plans yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isFiltering && plans.length > 0
                  ? "This restaurant doesn't deliver these plans to your location."
                  : "We're setting things up. Check back soon."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visiblePlans.map((plan, idx) => (
                <MealPlanCard
                  key={plan.id}
                  plan={plan}
                  featured={idx === 1}
                  images={planImages[plan.id] ?? []}
                  rating={ratingCount ? { average: ratingAvg, count: ratingCount } : null}
                  onOpen={() => navigate(`/services/food/${id}/plans/${plan.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ─── Information ─────────────────────────────────────────────────── */}
        {(provider.working_hours || provider.delivery_info || provider.location) && (
          <section>
            <h2 className="mb-4 text-xl font-black tracking-tight">Information</h2>
            <div className="divide-y divide-border rounded-3xl bg-card">
              {provider.working_hours && (
                <InfoRow
                  icon={<Clock className="h-4 w-4" />}
                  label="Operating Hours"
                  value={formatWorkingHours(provider.working_hours)}
                />
              )}
              {provider.delivery_info && (
                <InfoRow
                  icon={<Truck className="h-4 w-4" />}
                  label="Delivery"
                  value={provider.delivery_info}
                />
              )}
              {provider.location && (
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Location"
                  value={provider.location}
                />
              )}
            </div>
          </section>
        )}

        <FoodReviews providerId={id!} ownerUserId={provider.admin_user_id ?? null} />

      </main>

      <BottomNav />
    </div>
  );
};

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 text-lg font-black tabular-nums text-foreground">{value}</span>
      {sub != null && (
        <span className="mt-0.5 flex h-3.5 items-center text-[10px] uppercase tracking-wide text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-foreground whitespace-pre-line">{value}</p>
      </div>
    </div>
  );
}

export default FoodProviderDetail;
