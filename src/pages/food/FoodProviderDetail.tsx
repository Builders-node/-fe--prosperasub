import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChefHat,
  UtensilsCrossed,
  CalendarDays,
  Truck,
  Check,
  MapPin,
  Clock,
  ArrowRight,
  Star,
} from "lucide-react";
import { formatWorkingHours } from "@/lib/workingHours";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { FoodReviews } from "@/components/food/FoodReviews";
import { StarRating } from "@/components/food/StarRating";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";
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
      return (data ?? []) as FoodMealPlan[];
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

  const { data: reviewStats } = useQuery({
    queryKey: ["food-provider-rating", id],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_reviews")
        .select("rating")
        .eq("provider_id", id!);
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
        <HomeHeader title="Food" showBackButton onBack={() => navigate("/food")} />
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
        <HomeHeader title="Food" showBackButton onBack={() => navigate("/food")} />
        <DesktopHeader />
        <main className="market-content flex flex-col items-center justify-center py-16">
          <ChefHat className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Restaurant not found</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const fromPrice = plans.length
    ? Math.min(...plans.map((p) => p.weekly_price_cents))
    : provider.weekly_price_cents;
  const maxMeals = plans.length
    ? Math.max(...plans.map((p) => p.meals_per_week))
    : provider.meals_per_week;
  const ratingCount = reviewStats?.count ?? 0;
  const ratingAvg = reviewStats?.avg ?? 0;

  const scrollToPlans = () => {
    document.getElementById("meal-plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title={provider.name} showBackButton onBack={() => navigate("/food")} />
      <DesktopHeader />

      {/* ─── Full-width banner ───────────────────────────────────────────── */}
      <div className="relative h-52 w-full overflow-hidden bg-gradient-to-br from-orange-500/25 via-amber-500/10 to-transparent md:h-72">
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
                <div className="flex h-full items-center justify-center bg-orange-500/10">
                  <ChefHat className="h-9 w-9 text-orange-400" />
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

          {/* CTA row */}
          <div className="mt-5 flex items-center gap-4">
            <Button onClick={scrollToPlans} className="h-9 rounded-full px-7 font-bold">
              Subscribe
            </Button>
            <div className="leading-tight">
              <p className="text-sm font-bold text-foreground">{formatUSD(fromPrice)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">From / week</p>
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
          <Stat label="Plans" value={String(plans.length || 0)} sub="Available" />
          <Stat label="Per Week" value={String(maxMeals)} sub="Meals" />
          <Stat label="From" value={`$${Math.round(fromPrice / 100)}`} sub="/ week" />
        </section>

        {/* ─── Gallery carousel (App Store screenshots) ────────────────────── */}
        {gallery.length > 0 && (
          <section>
            <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
              {gallery.map((img) => (
                <div
                  key={img.id}
                  className="aspect-[3/4] w-56 shrink-0 snap-start overflow-hidden rounded-3xl bg-muted md:w-64"
                >
                  <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Meal Plans ──────────────────────────────────────────────────── */}
        <section id="meal-plans" className="scroll-mt-24">
          <h2 className="mb-4 text-xl font-black tracking-tight">
            Meal Plans
            {plans.length > 0 && (
              <span className="ml-2 text-base font-normal text-muted-foreground">({plans.length})</span>
            )}
          </h2>

          {loadingPlans ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-14 text-center">
              <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-semibold text-foreground">No plans available yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check back soon — meal plans are being configured.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan, idx) => (
                <MealPlanCard key={plan.id} plan={plan} featured={idx === 1} providerId={id!} />
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
      <span className="mt-0.5 shrink-0 text-orange-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-foreground whitespace-pre-line">{value}</p>
      </div>
    </div>
  );
}

function MealPlanCard({
  plan,
  featured,
  providerId,
}: {
  plan: FoodMealPlan;
  featured?: boolean;
  providerId: string;
}) {
  const navigate = useNavigate();

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/food/${providerId}/plans/${plan.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/food/${providerId}/plans/${plan.id}`);
        }
      }}
      className={`group flex cursor-pointer flex-col rounded-3xl border p-6 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
        featured
          ? "border-orange-500/50    hover:border-orange-500"
          : "bg-card hover:border-orange-500/40 hover: hover:shadow-black/20"
      }`}
    >
      {featured && (
        <span className="mb-3 self-start rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white">
          Most Popular
        </span>
      )}

      <h3 className="text-lg font-black tracking-tight text-foreground">{plan.name}</h3>

      {plan.description && (
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
      )}

      {/* Chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <UtensilsCrossed className="h-3 w-3" />
          {plan.meals_per_week} meals/week
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          {plan.days_per_week} days/week
        </span>
      </div>

      {/* Highlights */}
      {plan.highlights && plan.highlights.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {plan.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
              {h}
            </li>
          ))}
        </ul>
      )}

      {/* Price */}
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-black tabular-nums text-foreground">
          {formatUSD(plan.weekly_price_cents)}
        </span>
        <span className="text-sm text-muted-foreground">/ week</span>
      </div>

      {/* CTA */}
      <div className="mt-5" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          className="w-full rounded-full"
          onClick={() => navigate(`/food/${providerId}/plans/${plan.id}`)}
        >
          View Menu
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}

export default FoodProviderDetail;
