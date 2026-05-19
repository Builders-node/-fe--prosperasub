import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Zap,
  CalendarDays,
  Search,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { BottomNav } from "@/components/BottomNav";
import { PromoSlider } from "@/components/PromoSlider";
import { useFavorites } from "@/hooks/useFavorites";
import { PlanFilters, PlanFiltersState, initialFilters } from "@/components/PlanFilters";
import { useI18n } from "@/i18n";
import { formatUSD } from "@/lib/pricing";

// Default food images for subscription plans without uploaded images.
import foodImage1 from "@/assets/food-1.jpg";
import foodImage2 from "@/assets/food-2.jpg";


const defaultFoodImages = [foodImage1, foodImage2];

const Index = () => {
  const { isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [planFilters, setPlanFilters] = useState<PlanFiltersState>(initialFilters);
  const { toggleFavorite, isRestaurantFavorite, isPlanFavorite } = useFavorites();
  const { t } = useI18n();

  // Fetch featured restaurants
  const { data: restaurants, isLoading: restaurantsLoading } = useQuery({
    queryKey: ["featured-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .limit(6);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch featured plans with filters
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["featured-plans", selectedCategory, planFilters],
    queryFn: async () => {
      let query = supabase
        .from("subscription_plans")
        .select(`
          *,
          restaurants(name, logo_url)
        `)
        .eq("is_active", true);
      
      // Filter by category if not "all"
      if (selectedCategory !== "all") {
        query = query.eq("menu_category", selectedCategory as "standard" | "vegetarian" | "vegan" | "keto" | "gluten_free" | "lactose_free");
      }
      
      // Apply additional filters
      if (planFilters.supportsDelivery === true) {
        query = query.eq("supports_delivery", true);
      }
      if (planFilters.menuCategory && selectedCategory === "all") {
        query = query.eq("menu_category", planFilters.menuCategory as "standard" | "vegetarian" | "vegan" | "keto" | "gluten_free" | "lactose_free");
      }
      if (planFilters.maxPricePerWeek) {
        query = query.lte("price_per_week_sats", planFilters.maxPricePerWeek);
      }
      
      const { data, error } = await query.limit(12);
      
      if (error) throw error;
      
      // Client-side filter for meal_time if needed
      let filtered = data || [];
      if (planFilters.mealTime) {
        filtered = filtered.filter((plan: any) => {
          const mealTimeStr = plan.meal_time || "13:00:00";
          const hour = parseInt(mealTimeStr.split(":")[0]);
          if (planFilters.mealTime === "breakfast") return hour >= 6 && hour < 11;
          if (planFilters.mealTime === "lunch") return hour >= 11 && hour < 16;
          if (planFilters.mealTime === "dinner") return hour >= 16 && hour < 22;
          return true;
        });
      }
      
      return filtered;
    },
  });

  return (
    <div className="market-shell">
      {/* Mobile Header */}
      <HomeHeader />

      {/* Desktop Header */}
      <DesktopHeader />

      {/* Category Chips + Filters */}
      <div className="py-space-2 md:py-space-3">
        <div className="market-content">
          <CategoryChips 
            selected={selectedCategory}
            onSelect={(cat) => {
              setSelectedCategory(cat);
              // Clear menuCategory filter when using chips
              if (cat !== "all") {
                setPlanFilters(f => ({ ...f, menuCategory: null }));
              }
            }}
            rightContent={
              <PlanFilters 
                filters={planFilters}
                onFiltersChange={setPlanFilters}
              />
            }
          />
        </div>
      </div>

      {/* Restaurant Partners */}
      <PromoSlider
        title={t("home.restaurants")}
        items={(restaurants || []).map((restaurant) => ({
          id: restaurant.id,
          href: `/restaurants/${restaurant.id}`,
          name: restaurant.name,
          imageUrl: restaurant.logo_url,
          imageVariant: "restaurantLogo",
          meta: `20-30 min${restaurant.address ? ` · ${restaurant.address}` : ""}`,
          chips: [t("common.freeDelivery")],
          isFavorite: isRestaurantFavorite(restaurant.id),
        }))}
        isLoading={restaurantsLoading}
        onFavoriteToggle={(restaurantId) => toggleFavorite({ restaurantId })}
      />

      {/* Subscription Meal Plans */}
      <PromoSlider
        title={t("home.subscriptionMealPlan")}
        items={(plans || []).map((plan, index) => ({
          id: plan.id,
          href: `/plan/${plan.id}`,
          name: plan.name,
          imageUrl: plan.restaurants?.logo_url || defaultFoodImages[index % defaultFoodImages.length],
          meta: `${plan.meal_time || "13:00:00"} · ${formatUSD(plan.price_per_week_sats)} / ${t("common.week")}`,
          chips: [t("common.subscriptionPlan")],
          isFavorite: isPlanFavorite(plan.id),
        }))}
        isLoading={plansLoading}
        onFavoriteToggle={(planId) => toggleFavorite({ planId })}
      />

      {/* How It Works */}
      <section className="py-space-10 md:py-space-16">
        <div className="market-content">
          <div className="rounded-radius-xl bg-[hsl(var(--app-rail))] p-space-6 md:p-space-8 xl:p-space-10">
            <div className="mb-space-10 flex flex-col gap-space-3 md:mb-space-12 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-space-3 text-caption uppercase tracking-[0.14em] text-primary">{t("home.howItWorks")}</p>
                <h2 className="text-section-title">{t("home.subscribeInMinutes")}</h2>
              </div>
              <p className="max-w-xl text-body text-muted-foreground md:text-right">
                {t("home.howItWorksDescription")}
              </p>
            </div>

            <div className="grid gap-space-4 md:grid-cols-3 xl:gap-space-6">
              {[
                {
                  icon: Search,
                  step: "01",
                  title: t("home.stepBrowse"),
                  text: t("home.stepBrowseText"),
                },
                {
                  icon: CalendarDays,
                  step: "02",
                  title: t("home.stepSubscribe"),
                  text: t("home.stepSubscribeText"),
                },
                {
                  icon: Zap,
                  step: "03",
                  title: t("home.stepPayEnjoy"),
                  text: t("home.stepPayEnjoyText"),
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="rounded-radius-lg bg-background p-space-6 md:p-space-8">
                    <div className="mb-space-8 flex items-center justify-between">
                      <div className="flex h-14 w-14 items-center justify-center rounded-radius-lg bg-primary text-primary-foreground">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="text-section-title text-muted-foreground/30">{item.step}</span>
                    </div>
                    <h3 className="text-panel-title">{item.title}</h3>
                    <p className="mt-space-3 text-body text-muted-foreground">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-0">
        <div className="market-content">
          <div className="relative isolate min-h-[260px] overflow-hidden rounded-radius-xl bg-[linear-gradient(115deg,#58c8ed_0%,#806ee8_42%,#e463a7_72%,#ff8a3d_100%)] p-space-6 text-white md:min-h-[300px] md:p-space-8 xl:p-space-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.2),transparent_30%),radial-gradient(circle_at_82%_14%,rgba(255,255,255,0.18),transparent_24%)]" />
            <div className="absolute -bottom-12 left-[24%] h-32 w-56 -rotate-[28deg] rounded-radius-lg bg-[#ff4d2e] opacity-95 md:h-40 md:w-72">
              <span className="absolute left-space-8 top-space-8 rotate-[18deg] font-display text-3xl font-black uppercase text-white/75 md:text-5xl">
                Save
              </span>
            </div>
            <div className="absolute -bottom-10 left-[46%] h-36 w-64 rotate-[6deg] rounded-radius-lg bg-[#38c8f4] opacity-95 md:h-44 md:w-80">
              <span className="absolute left-space-10 top-space-8 font-display text-3xl font-black uppercase text-white/75 md:text-5xl">
                Deals
              </span>
            </div>
            <div className="absolute -right-12 top-[22%] h-28 w-60 -rotate-[26deg] rounded-radius-md bg-[#ffe100] opacity-95 md:h-36 md:w-80">
              <span className="absolute left-space-10 top-space-7 font-display text-3xl font-black uppercase text-black/35 md:text-5xl">
                Offers
              </span>
            </div>
            <div className="absolute bottom-[-34px] right-[2%] h-24 w-52 rotate-[18deg] rounded-radius-md bg-[#c600ff] opacity-90 md:h-32 md:w-72" />

            {[
              { label: "+20", className: "left-[41%] top-[46%]" },
              { label: "+15", className: "right-[10%] top-[22%]" },
              { label: "+7", className: "right-[12%] bottom-[12%]" },
            ].map((badge) => (
              <div
                key={badge.label}
                className={`absolute hidden rounded-radius-full bg-white px-space-4 py-space-2 font-display text-3xl font-black text-[#584bd7] shadow-sm md:block ${badge.className}`}
              >
                {badge.label}
              </div>
            ))}

            <div className="relative z-10 flex min-h-[210px] flex-col justify-between gap-space-8 md:min-h-[240px]">
              <div>
                <p className="mb-space-3 text-caption uppercase tracking-[0.14em] text-white/80">{t("home.ready")}</p>
                <h2 className="max-w-4xl font-display text-[clamp(2.4rem,6vw,5.2rem)] font-black leading-none text-white">
                  {t("home.freshMeals")}
                </h2>
                <p className="mt-space-4 max-w-2xl text-body text-white/85">
                  {t("home.ctaDescription")}
                </p>
              </div>

              <div className="flex flex-col gap-space-3 sm:flex-row">
                <Button asChild size="xl" variant="secondary" className="w-full bg-white text-black hover:bg-white/90 sm:w-auto">
                  <Link to="/restaurants">
                    {t("home.browseRestaurants")}
                  </Link>
                </Button>
                {!isAuthenticated && (
                  <Button asChild size="xl" variant="tertiary" className="w-full bg-black/25 text-white hover:bg-black/35 sm:w-auto">
                    <Link to="/auth">
                      {t("home.createAccount")}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Desktop Footer */}
      <footer className="hidden border-t border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))] md:block">
        <div className="market-content py-space-8">
          <div className="flex items-center justify-between gap-space-8">
            <Link to="/" className="font-display text-2xl font-black text-muted-foreground/70">
              ProsperaSub
            </Link>

            <div className="flex items-center gap-space-3">
              {[
                { eyebrow: t("footer.downloadOn"), label: "App Store" },
                { eyebrow: t("footer.getItOn"), label: "Google Play" },
                { eyebrow: t("footer.useWith"), label: "Lightning" },
              ].map((badge) => (
                <a
                  key={badge.label}
                  href="#"
                  className="flex min-w-[132px] items-center gap-space-2 rounded-radius-sm bg-[#1f1f1f] px-space-3 py-space-2 text-white transition-colors hover:bg-black"
                  aria-label={`${badge.eyebrow} ${badge.label}`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-radius-xs bg-white/10 font-display text-sm font-black">
                    {badge.label.charAt(0)}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[10px] font-semibold text-white/80">{badge.eyebrow}</span>
                    <span className="block font-display text-sm font-black">{badge.label}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>

          <div className="mt-space-8 border-t border-[hsl(var(--app-divider))] pt-space-8">
            <nav className="grid gap-space-8 text-body text-muted-foreground sm:grid-cols-2 lg:grid-cols-4" aria-label="Footer">
              {[
                [t("footer.whatWeSell"), t("footer.howItWorks"), t("footer.partnerWork")],
                [t("footer.landlords"), t("footer.suppliers"), t("footer.business")],
                [t("footer.partners"), t("footer.faq"), t("footer.recipes")],
                [t("footer.returns")],
              ].map((column, index) => (
                <div key={index} className="flex flex-col gap-space-3">
                  {column.map((item) => (
                    <a key={item} href="#" className="transition-colors hover:text-foreground">
                      {item}
                    </a>
                  ))}
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-space-8 border-t border-[hsl(var(--app-divider))] pt-space-6">
            <p className="max-w-5xl text-control leading-relaxed text-muted-foreground">
              {t("footer.legalDescription")}
            </p>
          </div>

          <div className="mt-space-8 flex items-center justify-between gap-space-6 text-control text-muted-foreground">
            <p>{t("footer.copyright")}</p>
            <div className="flex items-center gap-space-4">
              <a href="#" className="hover:text-foreground">{t("footer.userAgreement")}</a>
              <a href="#" className="hover:text-foreground">{t("footer.privacy")}</a>
              <a href="#" className="hover:text-foreground">{t("footer.press")}</a>
            </div>
            <div className="flex items-center gap-space-2">
              <Zap className="h-4 w-4 text-primary" />
              <span>{t("home.poweredByLightning")}</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
};

export default Index;
