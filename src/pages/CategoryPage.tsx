import { lazy, Suspense, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import { resolveCategoryIcon } from "@/lib/services/categoryIcons";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Category-key → legacy listing component. When one of these renders, the
 * category route (/category/food, /category/cleaning, …) shows the same
 * beautiful listing page that already exists at /food, /cleaning, etc. — no
 * duplication, no new pages. Categories NOT in this map (activities, future
 * domains) fall through to the generic provider+plans list below.
 */
const LEGACY_LISTINGS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  food:      lazy(() => import("./food/FoodListing")),
  home:      lazy(() => import("./cleaning/CleaningPackages")),
  transport: lazy(() => import("./cars/CarRental")),
  venues:    lazy(() => import("./beach/BeachClub")),
  wellness:  lazy(() => import("./massage/MassageListing")),
};

interface ProviderRow {
  id: string;
  category_key: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  status: string;
  source_service_key: string | null;
  source_provider_id: string | null;
}

interface PlanRow {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  period: string;
  status: string;
  sort_order: number;
  source_service_key: string | null;
  source_plan_id: string | null;
}

/**
 * Route: /category/:key — two independent sections:
 *   1) Providers as a horizontal-scroll rail (glance / filter / visit).
 *   2) Plans as a flat grid across all providers, each labeled with its owner.
 */
export default function CategoryPage() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const { categories, isLoading: catLoading } = useServiceCategories(false);
  const category = categories.find((c) => c.key === key);

  // Legacy categories delegate to their pre-existing listing component so
  // the /food-style page stays the source of truth. Rendering happens under
  // Suspense because the listing is lazy-loaded.
  const LegacyListing = key ? LEGACY_LISTINGS[key] : undefined;
  if (LegacyListing) {
    return (
      <Suspense fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }>
        <LegacyListing />
      </Suspense>
    );
  }

  const { data: providers = [], isLoading: provLoading } = useQuery({
    queryKey: ["category-providers", key],
    enabled: !!key,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, category_key, name, description, avatar_url, banner_url, status, source_service_key, source_provider_id")
        .eq("category_key", key!)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  const providerIds = useMemo(() => providers.map((p) => p.id), [providers]);
  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["category-plans", key, providerIds.join(",")],
    enabled: providerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id, provider_id, name, description, price_cents, currency, period, status, sort_order, source_service_key, source_plan_id")
        .in("provider_id", providerIds)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });

  // Provider public page (top-right "Visit" button + provider card click).
  const providerPublicHref = (p: ProviderRow) => {
    if (p.source_service_key === "food"    && p.source_provider_id) return `/food/${p.source_provider_id}`;
    if (p.source_service_key === "cars"    && p.source_provider_id) return `/cars`;
    if (p.source_service_key === "beach")                           return `/beach-club`;
    if (p.source_service_key === "cleaning")                        return `/cleaning`;
    if (p.source_service_key === "massage" && p.source_provider_id) return `/massage`;
    return `/discovery`;
  };

  // Plan → legacy per-service checkout page. Falls back to the provider's
  // page if we can't resolve a direct checkout URL.
  const planCheckoutHref = (plan: PlanRow, provider: ProviderRow): string => {
    if (plan.source_service_key === "food" && provider.source_provider_id && plan.source_plan_id) {
      return `/food/${provider.source_provider_id}/plans/${plan.source_plan_id}`;
    }
    if (plan.source_service_key === "beach" && plan.source_plan_id) {
      return `/beach-club/checkout/${plan.source_plan_id}`;
    }
    if (plan.source_service_key === "cleaning" && plan.source_plan_id) {
      return `/cleaning/checkout/${plan.source_plan_id}`;
    }
    if (plan.source_service_key === "massage" && plan.source_plan_id) {
      return `/massage`;
    }
    return providerPublicHref(provider);
  };

  const CategoryIcon = category ? category.Icon : resolveCategoryIcon(undefined);

  if (provLoading || catLoading) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-12">
        <HomeHeader title={category?.label ?? "Category"} showBackButton onBack={() => navigate("/discovery")} />
        <DesktopHeader showBackButton breadcrumb={category?.label} />
        <main className="market-content flex min-h-[40vh] items-center justify-center py-space-6">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title={category?.label ?? "Category"} showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader showBackButton breadcrumb={category?.label} />

      <main className="market-content space-y-8 py-space-4 md:py-space-6">
        {/* ─── Category header ────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl text-white", category?.accent ?? "bg-muted")}>
            <CategoryIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
              {category?.label ?? "Category"}
            </h1>
            {!category ? <p className="text-sm text-muted-foreground">Unknown category.</p> : null}
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-card px-4 py-16 text-center">
            <Store className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No providers here yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              This category is live — providers can register through <strong>Become a provider</strong> and appear here after approval.
            </p>
          </div>
        ) : (
          <>
            {/* ─── Providers horizontal rail ────────────────────── */}
            <section>
              <h2 className="mb-3 text-xl font-black tracking-tight text-foreground">Providers</h2>
              <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                <div className="flex gap-3 sm:gap-4">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigate(providerPublicHref(p))}
                      className="group flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      <div className={cn("h-24 w-full overflow-hidden", category?.accent ?? "bg-muted")}>
                        {p.banner_url ? (
                          <img src={p.banner_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-gradient-to-br from-black/0 via-black/10 to-black/25">
                            <CategoryIcon className="h-8 w-8 text-white/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-start gap-3 p-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center"><CategoryIcon className="h-5 w-5 text-muted-foreground/40" /></div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-foreground">{p.name}</p>
                          {p.description && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ─── Plans flat grid ──────────────────────────────── */}
            <section>
              <h2 className="mb-3 text-xl font-black tracking-tight text-foreground">Plans</h2>
              {plansLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/40" />)}
                </div>
              ) : plans.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  No plans available in this category yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {plans.map((plan) => {
                    const prov = providerById.get(plan.provider_id);
                    if (!prov) return null;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => navigate(planCheckoutHref(plan, prov))}
                        className="group flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{prov.name}</p>
                        <p className="font-bold text-foreground">{plan.name}</p>
                        {plan.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{plan.description}</p>
                        )}
                        <div className="mt-auto flex items-baseline gap-1.5 pt-2">
                          <span className="text-lg font-black text-primary">{formatUSD(plan.price_cents)}</span>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">/ {plan.period.replace("_", " ")}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
