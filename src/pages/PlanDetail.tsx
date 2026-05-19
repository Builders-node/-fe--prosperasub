import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Utensils, 
  MapPin, 
  Clock, 
  DollarSign, 
  CalendarDays,
  ArrowLeft,
  Heart,
  Info,
  Star
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import { HomeHeader } from "@/components/HomeHeader";
import { formatUSD } from "@/lib/pricing";
import { TranslationKey, useI18n } from "@/i18n";
import { RestaurantLogoTile } from "@/components/RestaurantLogoTile";
import { useFavorites } from "@/hooks/useFavorites";

const PlanDetail = () => {
  const { planId } = useParams();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toggleFavorite, isPlanFavorite } = useFavorites();

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select(`
          *,
          restaurants(id, name, logo_url, address)
        `)
        .eq('id', planId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: weeklyMenus } = useQuery({
    queryKey: ['plan-menus', plan?.restaurant_id, plan?.menu_category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_menus')
        .select(`
          *,
          menu_items(*)
        `)
        .eq('restaurant_id', plan!.restaurant_id)
        .eq('category', plan!.menu_category || 'standard')
        .eq('status', 'published')
        .order('week_start_date', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data;
    },
    enabled: !!plan,
  });

  // Format price as USD (value is stored in cents)
  const formatPrice = (cents: number) => formatUSD(cents);

  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mealOrder = ['breakfast', 'lunch', 'dinner'];

  const formatDay = (day: string) => {
    return t(`day.${day}` as TranslationKey);
  };

  const formatMealType = (type: string) => {
    if (type === "breakfast") return t("meal.breakfast");
    if (type === "lunch") return t("meal.lunch");
    if (type === "dinner") return t("meal.dinner");
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Get all menu items from menus (show all items, with or without images)
  const allMenuItems = weeklyMenus?.flatMap(menu => menu.menu_items || []) || [];

  // Group items by day, limit to 3 meals (one per meal type)
  const itemsByDay = allMenuItems.reduce((acc, item) => {
    const day = item.day_of_week;
    if (!acc[day]) {
      acc[day] = {};
    }
    // Keep one item per meal type
    if (!acc[day][item.meal_type]) {
      acc[day][item.meal_type] = item;
    }
    return acc;
  }, {} as Record<string, Record<string, typeof allMenuItems[0]>>);

  // Convert to array format, max 3 items per day
  const processedItemsByDay = Object.entries(itemsByDay).reduce((acc, [day, mealItems]) => {
    acc[day] = mealOrder.map(meal => mealItems[meal]).filter(Boolean).slice(0, 3);
    return acc;
  }, {} as Record<string, typeof allMenuItems>);

  if (planLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-radius-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-space-2">{t("plan.notFound")}</h2>
          <Button onClick={() => navigate('/restaurants')}>{t("plan.backToRestaurants")}</Button>
        </div>
      </div>
    );
  }

  const checkoutPath = isAuthenticated ? `/checkout/subscription/${plan.id}` : '/auth';
  const restaurant = plan.restaurants;

  return (
    <div className="min-h-screen bg-background pb-space-24 md:pb-0">
      <HomeHeader />

      <div className="border-b border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))] md:hidden">
        <div className="market-content flex h-12 items-center">
          <Button 
            variant="tertiary" 
            size="icon" 
            onClick={() => navigate('/restaurants')}
            className="-ml-2"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Desktop Header */}
      <DesktopHeader 
        showBackButton 
        onBack={() => navigate('/restaurants')}
        breadcrumb={plan.restaurants?.name || t("plan.details")}
      />

      <main className="mx-auto grid max-w-[1920px] gap-space-5 px-space-4 py-space-6 md:px-space-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-space-5">
          {/* Plan Header */}
          <section className="rounded-radius-xl bg-card px-space-6 py-space-8 md:px-space-8 md:py-space-10">
            <div className="flex items-start justify-between gap-space-5">
              <div>
                <div className="mb-space-3 flex flex-wrap items-center gap-space-3">
                  {plan.menu_category && (
                    <Badge className="rounded-radius-full bg-primary/20 px-space-3 py-space-1 font-bold capitalize text-primary hover:bg-primary/20">
                      {plan.menu_category.replace('_', ' ')}
                    </Badge>
                  )}
                  {restaurant?.name && (
                    <span className="text-sm font-semibold text-muted-foreground">
                      {t("plan.by")} {restaurant.name}
                    </span>
                  )}
                </div>
                <h1 className="font-display text-4xl font-black md:text-5xl">
                  {plan.name}
                </h1>
                <p className="mt-space-2 max-w-3xl text-lg text-muted-foreground">
                  {plan.description || t("plan.defaultDescription")}
                </p>
              </div>
              <Button
                size="icon"
                variant="favorite"
                data-state={isPlanFavorite(plan.id) ? "active" : "inactive"}
                className="shrink-0"
                onClick={() => toggleFavorite({ planId: plan.id })}
                aria-label={isPlanFavorite(plan.id) ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart className={`h-5 w-5 ${isPlanFavorite(plan.id) ? "fill-current" : ""}`} />
              </Button>
            </div>

            <div className="mt-space-8 flex flex-wrap gap-space-3">
              <div className="inline-flex items-center gap-space-2 rounded-radius-full border border-white/10 bg-background px-space-4 py-space-3 font-bold">
                <Star className="h-5 w-5 fill-foreground" />
                <span>4.8 · {t("plan.subscribers")}</span>
              </div>
              <div className="inline-flex items-center gap-space-2 rounded-radius-full border border-white/10 bg-background px-space-4 py-space-3 font-bold">
                <Clock className="h-5 w-5" />
                <span>{t("plan.mealAt")} {plan.meal_time}</span>
              </div>
              <div className="inline-flex items-center gap-space-2 rounded-radius-full border border-white/10 bg-background px-space-4 py-space-3 font-bold">
                <Info className="h-5 w-5" />
                <span>1-{plan.max_duration_weeks} {t("plan.weeks")}</span>
              </div>
            </div>
          </section>

          <section className="rounded-radius-xl bg-card p-space-6 md:p-space-8">
              <div className="mb-space-8 flex items-center gap-space-4 rounded-radius-xl bg-background p-space-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-radius-lg bg-primary text-primary-foreground">
                  <CalendarDays className="h-7 w-7" />
                </div>
                <div>
                  <p className="font-bold text-foreground">
                    {t("plan.checkoutSimple")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("plan.checkoutDescription")}
                  </p>
                </div>
              </div>

              {/* Weekly Menu */}
              <div id="weekly-menu" className="mb-space-8">
                <h2 className="font-display text-3xl font-black">{t("plan.menuTitle")}</h2>
              </div>
          
              {allMenuItems.length === 0 ? (
                <EmptyState
                  title={t("plan.menuComingSoon")}
                  description={t("plan.menuPreparing")}
                  className="bg-background"
                />
              ) : (
                <div className="space-y-space-6">
                  {dayOrder.map((day) => {
                    const dayItems = processedItemsByDay[day];
                    if (!dayItems || dayItems.length === 0) return null;

                    return (
                      <div key={day} className="overflow-hidden rounded-radius-xl bg-background">
                        <div className="bg-secondary px-space-5 py-space-4">
                          <h3 className="font-display text-xl font-bold capitalize">
                            {formatDay(day)}
                          </h3>
                        </div>
                        <div className="grid gap-space-5 p-space-5 md:grid-cols-2 xl:grid-cols-3">
                          {dayItems.map((item) => (
                            <article 
                              key={item.id} 
                              className="overflow-hidden rounded-radius-lg bg-card"
                            >
                              <div className="relative aspect-[16/9] overflow-hidden bg-secondary">
                                {item.image_url ? (
                                  <img 
                                    src={item.image_url} 
                                    alt={item.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <Utensils className="h-12 w-12 text-muted-foreground/30" />
                                  </div>
                                )}
                                <Badge className="absolute right-3 top-3 rounded-radius-full bg-secondary/95 px-space-3 py-space-1 capitalize text-foreground hover:bg-secondary">
                                  {formatMealType(item.meal_type)}
                                </Badge>
                              </div>
                              
                              <div className="p-space-5">
                                <h4 className="text-xl font-bold">{item.name}</h4>
                                {item.description && (
                                  <p className="mt-space-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                                    {item.description}
                                  </p>
                                )}
                                {item.tags && item.tags.length > 0 && (
                                  <div className="mt-space-4 flex flex-wrap gap-space-2">
                                    {item.tags.map((tag: string, idx: number) => (
                                      <Badge 
                                        key={idx} 
                                        variant="outline" 
                                        className="rounded-radius-full border-white/20 text-xs"
                                      >
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </section>
        </div>

        <aside id="restaurant-info" className="space-y-space-5 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-radius-xl bg-card p-space-8">
            <h2 className="font-display text-3xl font-black">{t("plan.restaurant")}</h2>
            <div className="mt-space-6 flex items-center gap-space-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-radius-lg bg-background">
                {restaurant?.logo_url ? (
                  <img src={restaurant.logo_url} alt={restaurant.name} className="h-full w-full object-cover" />
                ) : (
                  <RestaurantLogoTile name={restaurant?.name || t("plan.restaurantPartner")} size="micro" className="h-full w-full rounded-radius-lg" />
                )}
              </div>
              <div>
                <p className="text-xl font-bold">{restaurant?.name || t("plan.restaurantPartner")}</p>
                <p className="mt-space-1 line-clamp-2 text-sm text-muted-foreground">
                  {restaurant?.address || 'Prospera Village'}
                </p>
              </div>
            </div>

            <div className="mt-space-8 space-y-space-4 border-t border-white/10 pt-space-6">
              <div className="flex items-start gap-space-3" id="delivery-info">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-bold">{plan.supports_delivery ? t("plan.deliveryAvailable") : t("plan.pickupDineIn")}</p>
                  <p className="text-sm text-muted-foreground">
                    {plan.supports_delivery ? t("plan.deliveryAvailableDescription") : t("plan.pickupDineInDescription")}
                  </p>
                                </div>
              </div>
              <div className="flex items-start gap-space-3" id="payment-info">
                <DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-bold">{formatPrice(plan.price_per_week_sats)} / {t("common.week")}</p>
                  <p className="text-sm text-muted-foreground">{t("plan.payLightning")}</p>
                </div>
              </div>
              <div className="flex items-start gap-space-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-bold">1-{plan.max_duration_weeks} {t("plan.weeks")}</p>
                  <p className="text-sm text-muted-foreground">{t("plan.durationDescription")}</p>
                </div>
              </div>
            </div>

            <Button asChild size="xl" className="mt-space-8 w-full">
              <Link to={checkoutPath}>
                <DollarSign className="h-5 w-5" />
                {t("plan.subscribeNow")}
              </Link>
            </Button>
          </section>

          <section className="rounded-radius-xl bg-card p-space-8">
            <h3 className="font-display text-2xl font-black">{t("plan.summary")}</h3>
            <div className="mt-space-5 space-y-space-3 text-sm">
              <div className="flex justify-between gap-space-4">
                <span className="text-muted-foreground">{t("plan.mealTime")}</span>
                <span className="font-bold">{plan.meal_time}</span>
              </div>
              <div className="flex justify-between gap-space-4">
                <span className="text-muted-foreground">{t("plan.category")}</span>
                <span className="font-bold capitalize">{(plan.menu_category || 'standard').replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between gap-space-4">
                <span className="text-muted-foreground">{t("plan.weeklyPrice")}</span>
                <span className="font-bold text-primary">{formatPrice(plan.price_per_week_sats)}</span>
              </div>
            </div>
          </section>
        </aside>

      </main>

      <BottomNav />
    </div>
  );
};

export default PlanDetail;
