import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  MapPin, 
  Clock, 
  CheckCircle2,
  CalendarDays,
  Heart,
  Star,
  Bike
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { HomeHeader } from "@/components/HomeHeader";
import { supabase } from "@/integrations/supabase/client";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { formatUSD } from "@/lib/pricing";
import { RestaurantLogoTile } from "@/components/RestaurantLogoTile";
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";
import foodImage1 from "@/assets/food-1.jpg";
import foodImage2 from "@/assets/food-2.jpg";

const defaultFoodImages = [foodImage1, foodImage2];
const ratings = ["4.4 (228)", "4.0 (231)", "4.6 (1900+)", "4.1 (293)", "4.8 (520+)"];

const RestaurantDetail = () => {
  const { id } = useParams();
  const { toggleFavorite, isRestaurantFavorite, isPlanFavorite } = useFavorites();

  const { data: restaurant } = useQuery({
    queryKey: ['restaurant', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ['plans', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('restaurant_id', id)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Format price as USD (value is stored in cents)
  const formatPrice = (cents: number) => formatUSD(cents);

  return (
    <div className="min-h-screen bg-background pb-space-24 md:pb-0">
      <HomeHeader
        title={restaurant?.name || "Restaurant"}
        showBackButton
      />

      {/* Desktop Header */}
      <DesktopHeader
        showBackButton
        breadcrumb={restaurant?.name || "Restaurant Details"}
      />

      <main className="market-content py-space-8">
        {restaurant && (
          <>
            {/* Restaurant Hero */}
            <div className="relative mb-space-10">
              <div className="flex flex-col items-start gap-space-6 rounded-radius-xl bg-card p-space-6 md:flex-row md:p-space-8">
                {/* Logo */}
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-radius-lg bg-primary/10 md:h-32 md:w-32">
                  {restaurant.logo_url ? (
                    <img 
                      src={restaurant.logo_url} 
                      alt={restaurant.name} 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <RestaurantLogoTile name={restaurant.name} size="compact" className="h-full w-full rounded-radius-lg" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <h1 className="mb-space-3 type-page-title">
                    {restaurant.name}
                  </h1>

                  <p className="mb-space-4 type-body-large text-muted-foreground">
                    {restaurant.description || 'Delicious meals prepared fresh daily'}
                  </p>

                  <div className="flex flex-wrap gap-space-4 text-control">
                    {restaurant.address && (
                      <div className="flex items-center gap-space-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{restaurant.address}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-space-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>25-35 min delivery</span>
                    </div>
                    <div className="flex items-center gap-space-2 text-accent">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-medium">Open now</span>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="favorite"
                  size="icon"
                  data-state={isRestaurantFavorite(restaurant.id) ? "active" : "inactive"}
                  onClick={() => toggleFavorite({ restaurantId: restaurant.id })}
                  aria-label={isRestaurantFavorite(restaurant.id) ? "Remove from favorites" : "Add to favorites"}
                  className="absolute right-6 top-6 md:static md:ml-auto"
                >
                  <Heart className={`h-6 w-6 stroke-[2.6] ${isRestaurantFavorite(restaurant.id) ? "fill-current" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Subscription Plans - Clickable Cards */}
            <section>
              <div className="mb-space-6">
                <h2 className="text-section-title">Choose Your Plan</h2>
                <p className="mt-space-2 type-body text-muted-foreground">Select a plan to see the weekly menu and subscribe</p>
              </div>
              
              {plans?.length === 0 ? (
                <div className="rounded-radius-xl bg-card py-space-16 text-center">
                  <div className="mx-auto mb-space-4 flex h-16 w-16 items-center justify-center rounded-radius-lg bg-[hsl(var(--app-control))]">
                    <CalendarDays className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="mb-space-2 text-panel-title">No plans available</h3>
                  <p className="type-body text-muted-foreground">Check back soon for subscription options</p>
                </div>
              ) : (
                <div className="grid gap-x-space-8 gap-y-space-10 sm:grid-cols-2 xl:grid-cols-4">
                  {plans?.map((plan, index) => (
                    <Link 
                      key={plan.id} 
                      to={`/plan/${plan.id}`}
                      className="group block"
                    >
                      <div className="relative overflow-hidden rounded-radius-lg">
                        <img
                          src={(plan as any).image_url || defaultFoodImages[index % defaultFoodImages.length]}
                          alt={plan.name}
                          className="aspect-[2.55/1.25] w-full rounded-radius-lg object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                        />
                        <Button
                          type="button"
                          variant="favorite"
                          size="icon"
                          data-state={isPlanFavorite(plan.id) ? "active" : "inactive"}
                          onClick={(event) => {
                            event.preventDefault();
                            toggleFavorite({ planId: plan.id });
                          }}
                          className="absolute right-space-4 top-space-4"
                          aria-label={isPlanFavorite(plan.id) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart className={cn("h-7 w-7 stroke-[2.6]", isPlanFavorite(plan.id) && "fill-current")} />
                        </Button>
                      </div>

                      <div className="mt-space-3 px-space-3">
                        <div className="flex items-start justify-between gap-space-4">
                          <h3 className="line-clamp-1 text-card-title text-foreground">
                            {plan.name}
                          </h3>
                          <div className="flex shrink-0 items-center gap-space-1 text-control text-foreground/90">
                            <Star className="h-4 w-4 fill-current" />
                            <span>{ratings[index % ratings.length]}</span>
                          </div>
                        </div>

                        <div className="mt-space-1 flex items-center gap-space-2 text-body text-muted-foreground">
                          <Bike className="h-4 w-4" />
                          <span>{plan.meal_time || "13:00:00"} · {formatPrice(plan.price_per_week_sats)} / week</span>
                        </div>

                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      
      <BottomNav />
    </div>
  );
};

export default RestaurantDetail;
