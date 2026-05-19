import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  SlidersHorizontal,
  Search
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { RestaurantCard } from "@/components/RestaurantCard";
import { PlanCard } from "@/components/PlanCard";
import { CategoryChips } from "@/components/CategoryChips";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { EmptyState } from "@/components/EmptyState";
import { HomeHeader } from "@/components/HomeHeader";
import { useI18n } from "@/i18n";
import { useFavorites } from "@/hooks/useFavorites";

import foodImage1 from "@/assets/food-1.jpg";
import foodImage2 from "@/assets/food-2.jpg";

const defaultFoodImages = [foodImage1, foodImage2];

const Restaurants = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { t } = useI18n();
  const { toggleFavorite, isRestaurantFavorite, isPlanFavorite } = useFavorites();

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
    <div className="market-shell">
      <HomeHeader />

      {/* Desktop Header */}
      <DesktopHeader showBackButton breadcrumb={t("restaurants.breadcrumb")} />

      <div className="market-content pt-space-4 md:hidden">
        <form className="relative" role="search" onSubmit={handleMobileSearch}>
          <Input
            type="text"
            placeholder={t("restaurants.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            inputSize="search"
            leftIcon={<Search className="h-4 w-4" />}
          />
          <Button type="submit" variant="primary" size="iconSm" className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Search">
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {/* Category Chips */}
      <div className="pt-space-5 md:pt-space-8">
        <div className="market-content">
          <CategoryChips 
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        </div>
      </div>

      <main className="market-content py-space-8 md:py-space-12">
        {/* Results Count */}
        {!isLoading && !plansLoading && filteredRestaurants && (
          <p className="text-sm font-semibold text-muted-foreground mb-space-8">
            {isSearching
              ? `${totalResults} result${totalResults === 1 ? "" : "s"} for "${searchQuery}"`
              : `${filteredRestaurants.length} ${filteredRestaurants.length === 1 ? t("restaurants.result") : t("restaurants.results")}`}
          </p>
        )}

        {isLoading || (isSearching && plansLoading) ? (
          <div className="flex items-center justify-center py-space-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : totalResults === 0 ? (
          <EmptyState
            title={t("restaurants.noResultsTitle")}
            description={searchQuery ? t("restaurants.adjustSearch") : t("home.noRestaurantsDescription")}
          />
        ) : (
          <div className="space-y-space-12">
            {(filteredRestaurants?.length || 0) > 0 && (
              <section>
                {isSearching && <h2 className="mb-space-6 text-section-title">{t("home.restaurants")}</h2>}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-10">
                  {filteredRestaurants?.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      id={restaurant.id}
                      name={restaurant.name}
                      description={restaurant.description}
                      logoUrl={restaurant.logo_url}
                      address={restaurant.address}
                      isFavorite={isRestaurantFavorite(restaurant.id)}
                      onFavoriteToggle={() => toggleFavorite({ restaurantId: restaurant.id })}
                    />
                  ))}
                </div>
              </section>
            )}

            {isSearching && (filteredPlans?.length || 0) > 0 && (
              <section>
                <h2 className="mb-space-6 text-section-title">{t("home.subscriptionMealPlan")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-10">
                  {filteredPlans?.map((plan, index) => (
                    <PlanCard
                      key={plan.id}
                      id={plan.id}
                      name={plan.name}
                      description={plan.description}
                      pricePerWeekSats={plan.price_per_week_sats}
                      mealTime={plan.meal_time}
                      restaurantName={plan.restaurants?.name}
                      imageUrl={plan.restaurants?.logo_url || defaultFoodImages[index % defaultFoodImages.length]}
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
