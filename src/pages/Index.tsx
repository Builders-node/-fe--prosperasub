import { Link } from "react-router-dom";
import { Zap, CalendarDays, Search, Utensils, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { useFavorites } from "@/hooks/useFavorites";
import { PlanFilters, PlanFiltersState, initialFilters } from "@/components/PlanFilters";
import { useI18n } from "@/i18n";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

import foodImage1 from "@/assets/food-1.jpg";
import foodImage2 from "@/assets/food-2.jpg";

const defaultFoodImages = [foodImage1, foodImage2];

// Gradient palette for restaurant cards without images
const CARD_GRADIENTS = [
  { from: "#FFD9A0", to: "#FFB347" },
  { from: "#A8EDEA", to: "#6EC6EA" },
  { from: "#C9F7D9", to: "#74D0A5" },
  { from: "#FFC1CC", to: "#FF6B9D" },
  { from: "#FFF3A3", to: "#FFD700" },
  { from: "#DCC8FF", to: "#A78BFA" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Shared restaurant card — looks identical on mobile (2-col) and desktop (5-col) */
function RestaurantCard({
  id, name, logoUrl, planCount, index,
}: {
  id: string; name: string; logoUrl?: string | null; planCount: number; index: number;
}) {
  const gp = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  return (
    <Link
      to={`/restaurants/${id}`}
      className="group overflow-hidden rounded-[22px] bg-white transition-transform duration-150 hover:scale-[1.02]"
      style={{ boxShadow: "0 2px 14px rgba(0,0,0,0.07)" }}
    >
      <div className="relative overflow-hidden" style={{ height: 130 }}>
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${gp.from}, ${gp.to})` }}
          >
            <Utensils className="h-10 w-10 text-white/80" />
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
        <p className="truncate text-[13px] font-bold leading-tight" style={{ color: "#111111" }}>
          {name}
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: "#8A8A8A" }}>
          {planCount ? `${planCount} plan${planCount !== 1 ? "s" : ""}` : "Meal plans"}
        </p>
      </div>
    </Link>
  );
}

/** Shared plan card */
function PlanCard({ id, name, imageUrl, restaurantName, pricePerWeekSats, index }: {
  id: string; name: string; imageUrl: string; restaurantName?: string; pricePerWeekSats: number; index: number;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={`/plan/${id}`}
      className="group overflow-hidden rounded-[22px] bg-white transition-transform duration-150 hover:scale-[1.02]"
      style={{ boxShadow: "0 2px 14px rgba(0,0,0,0.07)" }}
    >
      <div className="overflow-hidden" style={{ height: 120 }}>
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      </div>
      <div className="px-3 py-2.5">
        <p className="truncate text-[13px] font-bold" style={{ color: "#111111" }}>{name}</p>
        <p className="mt-0.5 text-[11px]" style={{ color: "#8A8A8A" }}>
          {restaurantName ? `${restaurantName} · ` : ""}{formatUSD(pricePerWeekSats)}/{t("common.week")}
        </p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const Index = () => {
  const { isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [planFilters, setPlanFilters] = useState<PlanFiltersState>(initialFilters);
  const { t } = useI18n();

  const { data: restaurants, isLoading: restaurantsLoading } = useQuery({
    queryKey: ["featured-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants").select("*").eq("is_active", true).limit(8);
      if (error) throw error;
      return data;
    },
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["featured-plans", selectedCategory, planFilters],
    queryFn: async () => {
      let query = supabase
        .from("subscription_plans")
        .select("*, restaurants(name, logo_url)")
        .eq("is_active", true);

      if (selectedCategory !== "all") {
        query = query.eq("menu_category", selectedCategory as any);
      }
      if (planFilters.supportsDelivery === true) query = query.eq("supports_delivery", true);
      if (planFilters.menuCategory && selectedCategory === "all") {
        query = query.eq("menu_category", planFilters.menuCategory as any);
      }
      if (planFilters.maxPricePerWeek) query = query.lte("price_per_week_sats", planFilters.maxPricePerWeek);

      const { data, error } = await query.limit(10);
      if (error) throw error;

      let filtered = data || [];
      if (planFilters.mealTime) {
        filtered = filtered.filter((plan: any) => {
          const hour = parseInt((plan.meal_time || "13:00:00").split(":")[0]);
          if (planFilters.mealTime === "breakfast") return hour >= 6 && hour < 11;
          if (planFilters.mealTime === "lunch") return hour >= 11 && hour < 16;
          if (planFilters.mealTime === "dinner") return hour >= 16 && hour < 22;
          return true;
        });
      }
      return filtered;
    },
  });

  const restaurantCount = restaurants?.length ?? 0;

  const CATEGORIES = [
    { label: "All",      emoji: "🛍",  href: "/restaurants" },
    { label: "Food",     emoji: "🍽",  href: "/restaurants" },
    { label: "Cleaning", emoji: "✨",  href: "/cleaning"    },
    { label: "Weekly",   emoji: "📅",  href: "/restaurants" },
    { label: "Favorites",emoji: "❤️",  href: "/favorites"  },
    { label: "New",      emoji: "🎉",  href: "/restaurants" },
    { label: "Bookings", emoji: "📋",  href: "/my-subscriptions" },
    { label: "Pay",      emoji: "⚡",  href: "/auth"        },
  ] as const;

  const HOW_IT_WORKS = [
    { emoji: "🔍", step: "01", title: t("home.stepBrowse"),    text: t("home.stepBrowseText") },
    { emoji: "📅", step: "02", title: t("home.stepSubscribe"), text: t("home.stepSubscribeText") },
    { emoji: "⚡", step: "03", title: t("home.stepPayEnjoy"),  text: t("home.stepPayEnjoyText") },
  ];

  return (
    <div style={{ background: "#F6F7F8", minHeight: "100dvh" }}>
      {/* Headers */}
      <HomeHeader />
      <DesktopHeader />

      {/* ═══════════════════════════════════════════════════════
          SINGLE UNIFIED LAYOUT — responsive at every breakpoint
          Mobile: 1-col stacked · Desktop: wider grid, split hero
      ═══════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-4 md:px-8 md:pb-16 md:pt-8">
        <div className="space-y-5 md:space-y-10">

          {/* ── HERO ─────────────────────────────────────────── */}
          <section>
            <div
              className="overflow-hidden rounded-[24px] bg-white md:rounded-[28px]"
              style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
            >
              {/*
                Single grid: 1-col on mobile (art stacks on top, text below)
                2-col on lg: text left, art right
              */}
              <div className="grid grid-cols-1 lg:grid-cols-2">

                {/* Art — top on mobile (order-1 becomes order-first), right on desktop */}
                <div
                  className="order-1 flex items-center justify-center lg:order-2"
                  style={{
                    background: "linear-gradient(160deg, #F6F7F8 0%, #FFFFFF 100%)",
                    minHeight: 180,
                  }}
                >
                  <span
                    style={{
                      fontSize: "clamp(90px, 15vw, 160px)",
                      filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.10))",
                      lineHeight: 1,
                    }}
                  >
                    🍱
                  </span>
                </div>

                {/* Text + merchant card */}
                <div className="order-2 flex flex-col justify-center px-5 pb-5 pt-4 lg:order-1 lg:px-10 lg:py-16">
                  {/* Story indicators — always present in this section */}
                  <div className="mb-4 flex gap-2 lg:mb-8">
                    <div className="h-[3px] flex-[2] rounded-full" style={{ background: "#111111" }} />
                    <div className="h-[3px] flex-1 rounded-full" style={{ background: "rgba(17,17,17,0.25)" }} />
                    <div className="h-[3px] flex-1 rounded-full" style={{ background: "rgba(17,17,17,0.12)" }} />
                  </div>

                  <h1
                    style={{
                      fontSize: "clamp(20px, 4vw, 44px)",
                      fontWeight: 800,
                      lineHeight: 1.15,
                      color: "#111111",
                      letterSpacing: "-0.025em",
                    }}
                  >
                    Fresh meals every day.<br />Subscribe &amp; save.
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed lg:mt-3 lg:text-base" style={{ color: "#8A8A8A" }}>
                    Choose from top restaurants, weekly meal plans, and professional cleaning services.
                  </p>

                  {/* Merchant card */}
                  <div
                    className="mt-4 flex items-center gap-3 rounded-[16px] bg-white p-3 lg:mt-8 lg:rounded-[20px] lg:p-4"
                    style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.09)" }}
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl lg:h-14 lg:w-14 lg:text-2xl"
                      style={{ background: "#FEF08A" }}
                    >
                      🍽
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold lg:text-[16px]" style={{ color: "#111111" }}>
                        {restaurants?.[0]?.name || "Browse restaurants"}
                      </p>
                      <p className="text-[12px] lg:text-[13px]" style={{ color: "#8A8A8A" }}>
                        Meal subscriptions
                      </p>
                    </div>
                    <Link
                      to="/restaurants"
                      className="shrink-0 inline-flex h-9 items-center rounded-[14px] px-4 text-[13px] font-bold text-white transition hover:opacity-90 active:scale-95 lg:h-11 lg:rounded-[16px] lg:px-6 lg:text-[14px]"
                      style={{ background: "#202124" }}
                    >
                      Browse
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── CATEGORY SHORTCUTS ───────────────────────────── */}
          <section>
            <div className="flex gap-5 overflow-x-auto pb-1 scrollbar-hide md:gap-8">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.label}
                  to={cat.href}
                  className="flex shrink-0 flex-col items-center gap-2 transition-transform hover:scale-105"
                >
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{ width: 62, height: 62, background: "#EFEFEF", fontSize: 26, flexShrink: 0 }}
                  >
                    {cat.emoji}
                  </div>
                  <span className="text-[11px] font-medium lg:text-[13px]" style={{ color: "#111111" }}>
                    {cat.label}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── POPULAR RESTAURANTS ──────────────────────────── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-[18px] font-bold lg:text-[22px]"
                style={{ color: "#111111", letterSpacing: "-0.02em" }}
              >
                Popular
              </h2>
              <Link
                to="/restaurants"
                className="inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
                style={{ background: "#EFEFEF", color: "#111111" }}
              >
                All {restaurantCount > 0 ? restaurantCount : ""}{" "}
                <span style={{ color: "#8A8A8A" }}>›</span>
              </Link>
            </div>

            {restaurantsLoading ? (
              <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse overflow-hidden rounded-[22px] bg-white"
                    style={{ height: 185 }}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">
                {(restaurants || []).map((restaurant, index) => {
                  const planCount =
                    (restaurant as any).subscription_plans?.filter((p: any) => p.is_active)?.length ?? 0;
                  return (
                    <RestaurantCard
                      key={restaurant.id}
                      id={restaurant.id}
                      name={restaurant.name}
                      logoUrl={restaurant.logo_url}
                      planCount={planCount}
                      index={index}
                    />
                  );
                })}

                {/* Cleaning promo card — inline in the grid */}
                <Link
                  to="/cleaning"
                  className="group overflow-hidden rounded-[22px] transition-transform duration-150 hover:scale-[1.02]"
                  style={{
                    background: "linear-gradient(135deg, #1a1a2e, #0f3460)",
                    boxShadow: "0 2px 14px rgba(0,0,0,0.14)",
                    minHeight: 185,
                  }}
                >
                  <div className="relative flex h-full flex-col justify-between p-4">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      ✨
                    </div>
                    <div>
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        Service
                      </p>
                      <p className="mt-1 text-[15px] font-black leading-tight text-white">
                        Professional<br />Cleaning
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                        from $79/mo
                      </p>
                      <div
                        className="mt-2.5 inline-flex h-7 items-center rounded-full px-3 text-[11px] font-bold text-white"
                        style={{ background: "rgba(255,255,255,0.15)" }}
                      >
                        Book now
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            )}
          </section>

          {/* ── MEAL PLANS ───────────────────────────────────── */}
          {plans && plans.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2
                  className="text-[18px] font-bold lg:text-[22px]"
                  style={{ color: "#111111", letterSpacing: "-0.02em" }}
                >
                  {t("home.subscriptionMealPlan")}
                </h2>
                <Link
                  to="/restaurants"
                  className="inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
                  style={{ background: "#EFEFEF", color: "#111111" }}
                >
                  All plans <span style={{ color: "#8A8A8A" }}>›</span>
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">
                {plans.map((plan: any, index) => (
                  <PlanCard
                    key={plan.id}
                    id={plan.id}
                    name={plan.name}
                    imageUrl={plan.restaurants?.logo_url || defaultFoodImages[index % defaultFoodImages.length]}
                    restaurantName={plan.restaurants?.name}
                    pricePerWeekSats={plan.price_per_week_sats}
                    index={index}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── HOW IT WORKS ─────────────────────────────────── */}
          <section>
            <div
              className="overflow-hidden rounded-[24px] bg-white p-6 md:rounded-[28px] md:p-10"
              style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.06)" }}
            >
              <div className="mb-6 flex flex-col gap-2 md:mb-8 md:flex-row md:items-end md:justify-between">
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest lg:text-[11px]"
                    style={{ color: "#F8A31A" }}
                  >
                    {t("home.howItWorks")}
                  </p>
                  <h2
                    className="mt-1.5 text-[20px] font-black md:mt-2 md:text-[26px]"
                    style={{ color: "#111111", letterSpacing: "-0.02em" }}
                  >
                    {t("home.subscribeInMinutes")}
                  </h2>
                </div>
                <p className="text-[13px] leading-relaxed md:max-w-xs md:text-right" style={{ color: "#8A8A8A" }}>
                  {t("home.howItWorksDescription")}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {HOW_IT_WORKS.map((item) => (
                  <div
                    key={item.step}
                    className="rounded-[20px] px-5 py-5 md:px-7 md:py-6"
                    style={{ background: "#F6F7F8" }}
                  >
                    <div className="mb-4 flex items-center justify-between md:mb-5">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl text-[20px] md:h-12 md:w-12 md:text-[22px]"
                        style={{ background: "#EFEFEF" }}
                      >
                        {item.emoji}
                      </div>
                      <span
                        className="text-[32px] font-black md:text-[38px]"
                        style={{ color: "rgba(17,17,17,0.08)" }}
                      >
                        {item.step}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-bold md:text-[16px]" style={{ color: "#111111" }}>
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-[12px] leading-relaxed md:mt-2 md:text-[13px]" style={{ color: "#8A8A8A" }}>
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── CLEANING SERVICE BANNER ───────────────────────── */}
          <section>
            <div
              className="relative overflow-hidden rounded-[24px] p-6 text-white md:rounded-[28px] md:p-10"
              style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)" }}
            >
              {/* Decorative blobs */}
              <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5 md:-right-12 md:-top-12 md:h-56 md:w-56" />
              <div className="absolute -bottom-6 right-24 h-32 w-32 rounded-full bg-white/5 md:-bottom-8 md:right-32 md:h-40 md:w-40" />

              <div className="relative flex items-end justify-between gap-4">
                <div className="flex-1">
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest lg:text-[11px]"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Premium Service
                  </p>
                  <h2
                    className="mt-2 text-[22px] font-black leading-tight md:text-[34px]"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    Professional<br />Cleaning Service
                  </h2>
                  <p className="mt-1.5 text-[13px] md:mt-2 md:text-[15px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Weekly recurring sessions · from $79/mo
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3 md:mt-7">
                    <Link
                      to="/cleaning"
                      className="inline-flex h-10 items-center rounded-full bg-white px-6 text-[13px] font-bold text-slate-900 transition hover:bg-white/90 md:h-11 md:px-7 md:text-[14px]"
                    >
                      View plans
                    </Link>
                    {isAuthenticated && (
                      <Link
                        to="/cleaning/book"
                        className="inline-flex h-10 items-center rounded-full px-6 text-[13px] font-semibold text-white transition hover:bg-white/10 md:h-11 md:px-7 md:text-[14px]"
                        style={{ border: "1px solid rgba(255,255,255,0.2)" }}
                      >
                        Book session
                      </Link>
                    )}
                  </div>
                </div>
                {/* Art — shown at all sizes but smaller on mobile */}
                <div className="shrink-0">
                  <span
                    className="block"
                    style={{ fontSize: "clamp(60px, 10vw, 110px)", lineHeight: 1 }}
                  >
                    🧺
                  </span>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* ── Footer (desktop only — mobile has bottom nav instead) ── */}
      <footer
        className="hidden md:block"
        style={{ borderTop: "1px solid #E8E8E8", background: "#FFFFFF" }}
      >
        <div className="mx-auto max-w-[1280px] px-8 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link to="/" className="text-[17px] font-black transition-colors" style={{ color: "#8A8A8A" }}>
              ProsperaSub
            </Link>
            <div className="flex flex-wrap items-center gap-5 text-[13px]" style={{ color: "#8A8A8A" }}>
              <a href="#" className="transition-colors hover:text-foreground">{t("footer.userAgreement")}</a>
              <a href="#" className="transition-colors hover:text-foreground">{t("footer.privacy")}</a>
              <a href="#" className="transition-colors hover:text-foreground">{t("footer.press")}</a>
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" style={{ color: "#F8A31A" }} />
                {t("home.poweredByLightning")}
              </span>
            </div>
            <p className="text-[13px]" style={{ color: "#8A8A8A" }}>{t("footer.copyright")}</p>
          </div>
        </div>
      </footer>

      <BottomNav />
    </div>
  );
};

export default Index;
