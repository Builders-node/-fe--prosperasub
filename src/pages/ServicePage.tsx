import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { useQuery } from "@tanstack/react-query";
import { useProviderRatings } from "@/hooks/useProviderRatings";
import { useListingSearch } from "@/hooks/useListingSearch";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { providerHref } from "@/lib/services/serviceUrls";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { QueryError } from "@/components/QueryError";
import { UniversalPlanCard } from "@/components/patterns/UniversalPlanCard";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { PageLoader } from "@/components/ui/spinner";
import { SearchX } from "lucide-react";

/**
 * The listing for a service that has no bespoke page of its own.
 *
 * Until now every archetype needed a hand-written listing plus an entry in a
 * hard-coded route map, and Discovery deliberately hid any archetype missing
 * from that map ("an archetype without a matching public route is unreachable").
 * The effect was that adding a service in /admin/services produced nothing a
 * customer could ever see — the admin screen promised a kind of management the
 * app could not deliver.
 *
 * This page is what makes that promise true. It reads providers, categories
 * and plans from the universal tables, so a new archetype is a data change.
 * The four services that already have rich bespoke pages keep them; they are
 * matched by static routes, which React Router prefers over this dynamic one.
 */
interface ProviderRow {
  id: string;
  name: string;
  category_key: string | null;
  avatar_url: string | null;
  gallery_urls: unknown;
}

const ServicePage = () => {
  const { archetypeKey } = useParams<{ archetypeKey: string }>();
  const navigate = useNavigate();
  // Back returns to where the visitor actually was; this path is only
  // the fallback for a cold landing. See hooks/useGoBack.
  const goBack = useGoBack("/discovery");
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { archetypes, isLoading: archetypesLoading } = useServiceArchetypes(true);

  const archetype = archetypes.find((a) => a.key === archetypeKey);

  const providersQ = useQuery({
    queryKey: ["service-providers-public", archetypeKey],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, category_key, avatar_url, gallery_urls")
        .eq("archetype_key", archetypeKey!)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
    enabled: !!archetypeKey,
  });

  // A universal plan has no picture of its own; it borrows its provider's.
  const providerMedia = useMemo(() => {
    const m: Record<string, string[]> = {};
    (providersQ.data ?? []).forEach((p: any) => {
      const gallery: string[] = Array.isArray(p.gallery_urls) ? p.gallery_urls : [];
      m[p.id] = gallery.length ? gallery : (p.avatar_url ? [p.avatar_url] : []);
    });
    return m;
  }, [providersQ.data]);
  const ratings = useProviderRatings((providersQ.data ?? []).map((p: any) => p.id));

  const categoriesQ = useQuery({
    queryKey: ["service-categories-public", archetypeKey],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", archetypeKey!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; sort_order: number }>;
    },
    enabled: !!archetypeKey,
  });

  const plansQ = useQuery({
    queryKey: ["service-plans-public", archetypeKey],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id, provider_id, name, description, price_cents, currency, period, features, included_quantity, included_unit, providers!inner(name, archetype_key, category_key)")
        .eq("providers.archetype_key", archetypeKey!)
        .eq("status", "active")
        // Variants are reached by picking options on their offer, never listed
        // beside it — see hooks/usePlanOffers.
        .is("parent_plan_id", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!archetypeKey,
  });

  const providerGroups = useMemo(
    () => groupProvidersByCategory<ProviderRow>(
      providersQ.data ?? [], categoriesQ.data ?? [], (p) => p.category_key,
    ),
    [providersQ.data, categoriesQ.data],
  );

  const [activeCategory, setActiveCategory] = useCategoryParam();

  const rail = useMemo(
    () => providerGroups
      .filter((g) => activeCategory === ALL_CATEGORIES || g.key === activeCategory)
      .flatMap((g) => g.providers.map((p) => ({
        id: p.id, name: p.name,
        avatarUrl: p.avatar_url ?? null,
        gallery: (p.gallery_urls as string[]) ?? [],
        meta: g.label,
      }))),
    [providerGroups, activeCategory],
  );

  const chips = useMemo(
    () => providerGroups.map((g) => ({ key: g.key, label: g.label, count: g.providers.length })),
    [providerGroups],
  );

  const visiblePlans = useMemo(() => {
    const rows = plansQ.data ?? [];
    if (activeCategory === ALL_CATEGORIES) return rows;
    return rows.filter((r: any) => r.providers?.category_key === activeCategory);
  }, [plansQ.data, activeCategory]);

  const search = useListingSearch(visiblePlans, {
    text: (p: any) => [p.name, p.description, p.providers?.name, ...(Array.isArray(p.features) ? p.features : [])],
    price: (p: any) => p.price_cents,
    rating: (p: any) => ratings[p.provider_id]?.average ?? null,
    name: (p: any) => p.name ?? "",
  });

  const Icon = archetype?.Icon;

  // The archetype list decides whether this is a real service. Rendering an
  // empty listing for a typo'd URL would look like a business that closed.
  if (archetypesLoading) return <PageLoader />;
  if (!archetype) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-12">
        <HomeHeader title="Not found" showBackButton onBack={goBack} />
        <DesktopHeader />
        <main className="market-content py-space-8">
          <YdEmptyState
            icon={SearchX}
            title="No such service"
            subtitle="This service isn't on the platform. Browse what is."
          />
        </main>
        <BottomNav />
      </div>
    );
  }

  const openProvider = (providerId: string) => navigate(providerHref(archetype.key, providerId));
  const openPlan = (planId: string) => navigate(`/services/${archetype.key}/plans/${planId}`);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      {/* The archetype's own label — the same word the tile used and the same
          one the admin typed. */}
      <DesktopHeader />
      <ListingHeader
        title={archetype.label}
        onBack={goBack}
        query={search.query}
        onQueryChange={search.setQuery}
        placeholder={`Search ${archetype.label}`}
        sort={search.sort}
        onSortChange={search.setSort}
        sorts={search.availableSorts}
      />

      <main className="market-content py-space-4 md:py-space-8">
        {providersQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {[1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />)}
          </div>
        ) : providersQ.isError ? (
          <QueryError
            title="Couldn't load providers"
            error={providersQ.error instanceof Error ? providersQ.error.message : undefined}
            onRetry={() => providersQ.refetch()}
            retrying={providersQ.isFetching}
          />
        ) : providerGroups.length === 0 ? (
          <YdEmptyState
            icon={Icon}
            title="No providers yet"
            subtitle="We're setting things up. Check back soon."
          />
        ) : (
          <div className="space-y-4">
            {chips.length > 1 && (
              <CategoryChips categories={chips} value={activeCategory} onChange={setActiveCategory} />
            )}
            <ProviderRail providers={rail} icon={Icon!} label="Providers" onOpen={openProvider} />
          </div>
        )}

        <section id="plans" className="mt-space-6 scroll-mt-4">
          <h2 className="mb-3 text-[20px] font-semibold tracking-[-0.4px] text-foreground">Plans</h2>

          {plansQ.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {[1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : plansQ.isError ? (
            <QueryError
              title="Couldn't load plans"
              error={plansQ.error instanceof Error ? plansQ.error.message : undefined}
              onRetry={() => plansQ.refetch()}
              retrying={plansQ.isFetching}
            />
          ) : visiblePlans.length > 0 ? (
            <>
              {search.results.length === 0 ? (
                <YdEmptyState icon={SearchX} title="No plans match" subtitle="Try a different word, or clear the search." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {search.results.map((plan: any) => (
                    <UniversalPlanCard
                      key={plan.id}
                      plan={plan}
                      rating={ratings[plan.provider_id]}
                      photos={providerMedia[plan.provider_id]}
                      onSubscribe={openPlan}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <YdEmptyState
              icon={Icon}
              title="No plans yet"
              subtitle="We're setting things up. Check back soon."
            />
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default ServicePage;
