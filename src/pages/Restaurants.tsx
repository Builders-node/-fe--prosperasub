import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  SlidersHorizontal,
  Search,
  Utensils,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { PlanCard } from "@/components/PlanCard";
import { CategoryChips } from "@/components/CategoryChips";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { EmptyState } from "@/components/EmptyState";
import { HomeHeader } from "@/components/HomeHeader";
import { useI18n } from "@/i18n";
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";

import foodImage1 from "@/assets/food-1.jpg";
import foodImage2 from "@/assets/food-2.jpg";

const defaultFoodImages = [foodImage1, foodImage2];

// Gradient palette for restaurant placeholder cards
const gradients = [
  "from-orange-300 to-red-400",
  "from-blue-300 to-indigo-400",
  "from-green-300 to-emerald-400",
  "from-pink-300 to-rose-400",
  "from-yellow-300 to-amber-400",
  "from-violet-300 to-purple-400",
];

const Restaurants = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { t } = useI18n();
  const { toggleFavorite, isPlanFavorite } = useFavorites();

  useEffect(() => {
    setSearchQuery(searchParams.get("search") || "");
  }, [searchParams]);

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ['restaurants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*, subscription_plans(id, is_active, menu_category)')
        .eq('is_active', true);
      if (error) throw error;
      return data?.filter(r => r.subscription_plans?.some((p: any) => p.is_active)) || [];
    },
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["restaurant-search-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*, restaurants(name, logo_url)")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const filteredRestaurants = restaurants?.filter((restaurant) => {
    const matchesSearch =
      !normalizedSearch ||
      restaurant.name.toLowerCase().includes(normalizedSearch) ||
      restaurant.description?.toLowerCase().includes(normalizedSearch) ||
      restaurant.address?.toLowerCase().includes(normalizedSearch);
    const matchesCategory =
      selectedCategory === "all" ||
      restaurant.subscription_plans?.some((plan: any) => plan.menu_category === selectedCategory);

    return matchesSearch && matchesCategory;
  });

  const filteredPlans = plans?.filter((plan) => {
    const restaurantName = plan.restaurants?.name || "";
    const matchesSearch =
      !normalizedSearch ||
      plan.name.toLowerCase().includes(normalizedSearch) ||
      plan.description?.toLowerCase().includes(normalizedSearch) ||
      restaurantName.toLowerCase().includes(normalizedSearch);
    const matchesCategory = selectedCategory === "all" || plan.menu_category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleMobileSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    setSearchParams(query ? { search: query } : {});
  };

  const totalResults = (filteredRestaurants?.length || 0) + (isSearching ? filteredPlans?.length || 0 : 0);

  return (
    <div style={{ background: "#F6F7F8", minHeight: "100dvh" }} className="pb-24 md:pb-0">
      <HomeHeader title={t("restaurants.breadcrumb")} showBackButton={false} />
      <DesktopHeader showBackButton breadcrumb={t("restaurants.breadcrumb")} />

      {/* ── Single unified search + filter row ── */}
      <div className="mx-auto max-w-[1280px] px-4 pt-4 md:px-8 md:pt-6">
        <form className="relative max-w-xl" role="search" onSubmit={handleMobileSearch}>
          <Input
            type="text"
            placeholder={t("restaurants.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            inputSize="search"
            leftIcon={<Search className="h-4 w-4" />}
          />
          <Button
            type="submit"
            variant="primary"
            size="iconSm"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            aria-label="Search"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </form>

        {/* Category chips */}
        <div className="mt-4 mb-4">
          <CategoryChips selected={selectedCategory} onSelect={setSelectedCategory} />
        </div>
      </div>

      {/* ── Single unified main content ── */}
      <main className="mx-auto max-w-[1280px] px-4 pb-6 md:px-8">
        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-black tracking-tight text-foreground">
            {isSearching ? `Results` : t("home.restaurants")}
          </h2>
          {!isLoading && filteredRestaurants && (
            <span className="rounded-full bg-muted px-4 py-1 text-sm font-semibold text-foreground">
              All {totalResults}
            </span>
          )}
        </div>

        {/* ── Section header ── */}
        {!isLoading && !plansLoading && (
          <div className="mb-4 flex items-center justify-between">
            <h2
              className="text-[18px] font-bold md:text-[22px]"
              style={{ color: "#111111", letterSpacing: "-0.02em" }}
            >
              {isSearching ? `Results for "${searchQuery}"` : t("home.restaurants")}
            </h2>
            <span
              className="rounded-full px-4 py-1.5 text-[13px] font-semibold"
              style={{ background: "#EFEFEF", color: "#111111" }}
            >
              {totalResults} {totalResults === 1 ? t("restaurants.result") : t("restaurants.results")}
            </span>
          </div>
        )}

        {/* ── Unified content ── */}
        {isLoading || (isSearching && plansLoading) ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : totalResults === 0 ? (
          <EmptyState
            title={t("restaurants.noResultsTitle")}
            description={searchQuery ? t("restaurants.adjustSearch") : t("home.noRestaurantsDescription")}
          />
        ) : (
          <div className="space-y-8 md:space-y-12">

            {/* Restaurant grid — 2-col mobile → 3-col md → 4-col lg → 5-col xl */}
            {(filteredRestaurants?.length || 0) > 0 && (
              <section>
                {isSearching && (
                  <h3 className="mb-3 text-[15px] font-bold md:mb-5 md:text-[18px]" style={{ color: "#111111" }}>
                    {t("home.restaurants")}
                  </h3>
                )}
                <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">
                  {filteredRestaurants?.map((restaurant, index) => {
                    const activePlanCount =
                      restaurant.subscription_plans?.filter((p: any) => p.is_active)?.length ?? 0;
                    return (
                      <Link
                        key={restaurant.id}
                        to={`/restaurants/${restaurant.id}`}
                        className="group overflow-hidden rounded-[22px] bg-white transition-transform duration-150 hover:scale-[1.02]"
                        style={{ boxShadow: "0 2px 14px rgba(0,0,0,0.07)" }}
                      >
                        <div className="relative overflow-hidden" style={{ height: 130 }}>
                          {restaurant.logo_url ? (
                            <img
                              src={restaurant.logo_url}
                              alt={restaurant.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className={cn(
                                "flex h-full w-full items-center justify-center bg-gradient-to-br",
                                gradients[index % gradients.length],
                              )}
                            >
                              <Utensils className="h-10 w-10 text-white/70" />
                            </div>
                          )}
                          <div
                            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-sm"
                            style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}
                          >
                            ⭐
                          </div>
                        </div>
                        <div className="px-3 py-2.5">
                          <p
                            className="truncate text-[13px] font-bold leading-tight"
                            style={{ color: "#111111" }}
                          >
                            {restaurant.name}
                          </p>
                          {activePlanCount > 0 && (
                            <p className="mt-0.5 text-[11px]" style={{ color: "#8A8A8A" }}>
                              {activePlanCount} plan{activePlanCount !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Plans grid — shown when searching */}
            {isSearching && (filteredPlans?.length || 0) > 0 && (
              <section>
                <h3 className="mb-3 text-[15px] font-bold md:mb-5 md:text-[18px]" style={{ color: "#111111" }}>
                  {t("home.subscriptionMealPlan")}
                </h3>
                <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredPlans?.map((plan, index) => (
                    <PlanCard
                      key={plan.id}
                      id={plan.id}
                      name={plan.name}
                      description={plan.description}
                      pricePerWeekSats={plan.price_per_week_sats}
                      mealTime={plan.meal_time}
                      restaurantName={plan.restaurants?.name}
                      imageUrl={
                        plan.restaurants?.logo_url ||
                        defaultFoodImages[index % defaultFoodImages.length]
                      }
                      isFavorite={isPlanFavorite(plan.id)}
                      onFavoriteToggle={() => toggleFavorite({ planId: plan.id })}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Restaurants;
