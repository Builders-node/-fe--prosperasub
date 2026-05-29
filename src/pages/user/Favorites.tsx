import { Link } from "react-router-dom";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorites } from "@/hooks/useFavorites";
import { UserLayout } from "@/components/layout/UserLayout";
import { EmptyState } from "@/components/EmptyState";
import { RestaurantCard } from "@/components/RestaurantCard";
import { PlanCard } from "@/components/PlanCard";

import food1 from "@/assets/food-1.jpg";
import food2 from "@/assets/food-2.jpg";

const defaultImages = [food1, food2];

const Favorites = () => {
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { favorites, toggleFavorite } = useFavorites();

  const { data: favoriteRestaurants, isLoading: loadingRestaurants } = useQuery({
    queryKey: ["favorite-restaurants", favorites],
    queryFn: async () => {
      const restaurantIds = favorites
        .filter((f) => f.restaurant_id)
        .map((f) => f.restaurant_id);
      
      if (restaurantIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .in("id", restaurantIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: favorites.length > 0,
  });

  const { data: favoritePlans, isLoading: loadingPlans } = useQuery({
    queryKey: ["favorite-plans", favorites],
    queryFn: async () => {
      const planIds = favorites
        .filter((f) => f.plan_id)
        .map((f) => f.plan_id);
      
      if (planIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*, restaurants(name, logo_url)")
        .in("id", planIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: favorites.length > 0,
  });

  const isLoading = loadingRestaurants || loadingPlans;

  if (!isAuthenticated) {
    return (
      <UserLayout title="Favorites">
        <div className="flex items-center justify-center py-space-20">
          <EmptyState
            title="Sign in to see your favorites"
            description="Save restaurants and meal plans you love."
            className="w-full max-w-md mx-space-4"
            action={
              <Button onClick={() => openAuthModal("login", "/favorites")}>
                Sign In
              </Button>
            }
          />
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Favorites">
      <div className="mx-auto w-full max-w-6xl px-space-5 py-space-8 sm:px-space-8 lg:px-space-10 lg:py-space-12">
        <div className="mb-space-8">
          <p className="text-caption uppercase tracking-[0.16em] text-primary">Saved</p>
          <h1 className="mt-space-2 type-page-title text-foreground">My Favorites</h1>
          <p className="mt-space-3 max-w-2xl type-body-large text-muted-foreground">
            Restaurants and meal plans you marked for later.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-space-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : favorites.length === 0 ? (
          <EmptyState
            title="No favorites yet"
            description="Start exploring and save your favorite restaurants and plans."
            action={
              <Button asChild>
                <Link to="/">Browse Restaurants</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-space-8">
            {/* Favorite Restaurants */}
            {favoriteRestaurants && favoriteRestaurants.length > 0 && (
              <section>
                <h2 className="mb-space-4 text-section-title">Restaurants</h2>
                <div className="grid gap-space-5 sm:grid-cols-2 lg:grid-cols-3">
                  {favoriteRestaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      id={restaurant.id}
                      name={restaurant.name}
                      description={restaurant.description}
                      logoUrl={restaurant.logo_url}
                      address={restaurant.address}
                      isFavorite
                      onFavoriteToggle={() => toggleFavorite({ restaurantId: restaurant.id })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Favorite Plans */}
            {favoritePlans && favoritePlans.length > 0 && (
              <section>
                <h2 className="mb-space-4 text-section-title">Meal Plans</h2>
                <div className="grid gap-space-5 sm:grid-cols-2 lg:grid-cols-3">
                  {favoritePlans.map((plan: any, index) => (
                    <PlanCard
                      key={plan.id}
                      id={plan.id}
                      name={plan.name}
                      description={plan.description}
                      pricePerWeekSats={plan.price_per_week_sats}
                      mealTime={plan.meal_time}
                      restaurantName={plan.restaurants?.name}
                      imageUrl={plan.image_url || defaultImages[index % defaultImages.length]}
                      isFavorite
                      onFavoriteToggle={() => toggleFavorite({ planId: plan.id })}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default Favorites;
