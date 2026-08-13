import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useProviderRatings } from "@/hooks/useProviderRatings";
import { useListingSearch } from "@/hooks/useListingSearch";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { useArchetypeLabel } from "@/hooks/useServiceArchetypes";
import { SearchX, Waves } from "lucide-react";
import { providerHref } from "@/lib/services/serviceUrls";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { QueryError } from "@/components/QueryError";
import { EntertainmentPlanCard } from "@/components/patterns/EntertainmentPlanCard";
import { UniversalPlanCard } from "@/components/patterns/UniversalPlanCard";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";

interface BeachPlan {
  id: string;
  name: string;
  tagline: string | null;
  price_per_person_cents: number;
  amenities: string[];
  featured: boolean;
}

interface EntertainmentProvider {
  id: string;
  name: string;
  /** Which category (Beach Membership · Court Bookings · …) this provider serves. */
  category_key: string | null;
}

interface EntertainmentCategory {
  key: string;
  label: string;
  sort_order: number;
}

const BeachClub = () => {
  const navigate = useNavigate();
  const serviceTitle = useArchetypeLabel("entertainment", "Entertainment");
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  // Providers under the Entertainment archetype. Right now there's one
  // (Beach Club) but this is the multi-provider surface — the page mirrors
  // Food (providers on top → plans below) so adding a second provider is a
  // data-only change.
  const providersQ = useQuery({
    queryKey: ["entertainment-providers-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, category_key, avatar_url, gallery_urls")
        .eq("archetype_key", "entertainment")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntertainmentProvider[];
    },
  });

  // Categories under the Entertainment archetype. Drives the top-level
  // grouping: one section per category (Beach Membership · Court Bookings)
  // so a "gym" or "spa" provider added later automatically gets its own
  // bucket instead of being smushed into the memberships grid.
  // Ratings and photos both belong to the provider — beach_club_plans has no
  // image of its own, so a plan borrows its club's gallery.
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
    queryKey: ["entertainment-categories-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", "entertainment")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntertainmentCategory[];
    },
  });

  // Group providers by category, keeping only categories that have at
  // least one provider. Providers without category_key fall into "Other".
  const providerGroups = useMemo(
    () => groupProvidersByCategory<EntertainmentProvider>(
      providersQ.data ?? [], categoriesQ.data ?? [], (p) => p.category_key,
    ),
    [providersQ.data, categoriesQ.data],
  );

  // The membership lookup that used to gate the "Book a court" shortcut went
  // with the shortcut. It was a per-load query against beach_club_subscriptions
  // whose only consumer was that banner.

  const plansQ = useQuery({
    queryKey: ["entertainment-plans-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_plans")
        .select("*, owner_provider_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BeachPlan[];
    },
  });

  /**
   * Plans for providers under this archetype that have no legacy table.
   * `beach_club_plans` above only knows the Beach Club; a provider like Massage
   * keeps its offer in provider_plans, so without this its plans exist, show on
   * its own provider page, and are invisible on the listing everyone lands on.
   *
   * Scoped by the PROVIDER being universal rather than by the plan's own
   * source_service_key: the backfill gave legacy providers provider_plans rows
   * too, and matching on the plan would list the Beach Club's membership twice.
   */
  const universalPlansQ = useQuery({
    queryKey: ["entertainment-universal-plans-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id, provider_id, name, description, price_cents, currency, period, features, included_quantity, included_unit, providers!inner(name, archetype_key, source_service_key, category_key)")
        .eq("providers.archetype_key", "entertainment")
        .is("providers.source_service_key", null)
        .eq("status", "active")
        .is("parent_plan_id", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const railProviders = useMemo(
    () => providerGroups.flatMap((g) =>
      g.providers.map((p: any) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatar_url ?? null,
        gallery: p.gallery_urls ?? [],
        meta: g.label,
      }))),
    [providerGroups],
  );
  const chipCategories = useMemo(
    () => providerGroups.map((g) => ({ key: g.key, label: g.label, count: g.providers.length })),
    [providerGroups],
  );
  const [activeCategory, setActiveCategory] = useCategoryParam();
  const visibleRail = activeCategory === ALL_CATEGORIES
    ? railProviders
    : providerGroups
        .filter((g) => g.key === activeCategory)
        .flatMap((g) => g.providers.map((p: any) => ({
          id: p.id, name: p.name, avatarUrl: p.avatar_url ?? null,
          gallery: p.gallery_urls ?? [], meta: g.label,
        })));

  /**
   * The chip narrows BOTH plan grids, not just the rail.
   *
   * A comment here used to claim beach_club_plans had no owner column, so the
   * grid "stays whole" while the rail filtered. It does have one —
   * owner_provider_id, populated — and ProviderDetail has been filtering on it
   * all along. Left as it was, picking "Massage" would have shown the massage
   * plan next to the Beach Club membership.
   */
  const providerCategory = useMemo(() => {
    const m: Record<string, string | null> = {};
    (providersQ.data ?? []).forEach((p: any) => { m[p.id] = p.category_key ?? null; });
    return m;
  }, [providersQ.data]);

  const inActiveCategory = (categoryKey: string | null | undefined) =>
    activeCategory === ALL_CATEGORIES || categoryKey === activeCategory;

  const visibleBeachPlans = useMemo(
    () => (plansQ.data ?? []).filter((pl: any) =>
      inActiveCategory(providerCategory[pl.owner_provider_id])),
    [plansQ.data, providerCategory, activeCategory],
  );

  const visibleUniversalPlans = useMemo(
    () => (universalPlansQ.data ?? []).filter((r: any) =>
      inActiveCategory(r.providers?.category_key)),
    [universalPlansQ.data, activeCategory],
  );

  /**
   * Both grids are one list as far as a customer is concerned — a membership
   * and a massage plan are two things on offer here — so search and sort run
   * across the pair rather than inside each half.
   */
  const allPlans = useMemo(
    () => [
      ...visibleBeachPlans.map((plan: any) => ({
        kind: "beach" as const,
        plan,
        providerId: plan.owner_provider_id as string,
        name: plan.name as string,
        text: [plan.name, plan.tagline, ...(plan.amenities ?? [])],
        price: plan.price_per_person_cents as number | null,
      })),
      ...visibleUniversalPlans.map((plan: any) => ({
        kind: "universal" as const,
        plan,
        providerId: plan.provider_id as string,
        name: plan.name as string,
        text: [plan.name, plan.description, plan.providers?.name],
        price: plan.price_cents as number | null,
      })),
    ],
    [visibleBeachPlans, visibleUniversalPlans],
  );

  const search = useListingSearch(allPlans, {
    text: (i) => i.text,
    price: (i) => i.price,
    rating: (i) => ratings[i.providerId]?.average ?? null,
    name: (i) => i.name,
  });

  const openProvider = (providerId: string) => {
    navigate(providerHref("entertainment", providerId));
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <DesktopHeader />
      <ListingHeader
        title={serviceTitle}
        onBack={() => navigate("/discovery")}
        query={search.query}
        onQueryChange={search.setQuery}
        placeholder={`Search ${serviceTitle}`}
        sort={search.sort}
        onSortChange={search.setSort}
        sorts={search.availableSorts}
        showLocation={false}
      />

      <main className="market-content py-space-4 md:py-space-8">
        {/* ─── Providers grouped by category ──────────────────────────
            "Beach Membership" providers on top, "Court Bookings" below, etc.
            Header hidden when only one category is populated so single-
            provider archetypes stay clean. Empty when no providers. */}
        {providersQ.isLoading ? (
          <section>
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          </section>
        ) : providersQ.isError ? (
          <QueryError
            title="Couldn't load providers"
            error={providersQ.error instanceof Error ? providersQ.error.message : undefined}
            onRetry={() => providersQ.refetch()}
            retrying={providersQ.isFetching}
          />
        ) : providerGroups.length === 0 ? (
          <YdEmptyState icon={Waves} title="No providers yet" subtitle="We're setting things up. Check back soon." />
        ) : (
          <div className="space-y-4">
            <CategoryChips categories={chipCategories} value={activeCategory} onChange={setActiveCategory} />
            <ProviderRail providers={visibleRail} icon={Waves} label="Providers" onOpen={openProvider} />
          </div>
        )}

        {/* ─── Plans ──────────────────────────────────────────────── */}
        <section id="entertainment-plans" className="mt-space-6 scroll-mt-4">
          <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.4px] text-foreground">Plans</h2>

          {plansQ.isLoading ? (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : plansQ.isError ? (
            <QueryError
              title="Couldn't load plans"
              error={plansQ.error instanceof Error ? plansQ.error.message : undefined}
              onRetry={() => plansQ.refetch()}
              retrying={plansQ.isFetching}
            />
          ) : allPlans.length > 0 ? (
            <>
              {search.results.length === 0 ? (
                <YdEmptyState icon={SearchX} title="No plans match" subtitle="Try a different word, or clear the search." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {search.results.map((item) =>
                    item.kind === "beach" ? (
                      <EntertainmentPlanCard
                        key={item.plan.id}
                        plan={item.plan}
                        rating={ratings[item.providerId]}
                        photos={providerMedia[item.providerId]}
                        onSubscribe={(id) => {
                          const href = `/services/beach-club/checkout/${id}`;
                          if (!isAuthenticated) openAuthModal("login", href);
                          else navigate(href);
                        }}
                      />
                    ) : (
                      <UniversalPlanCard
                        key={item.plan.id}
                        plan={item.plan}
                        rating={ratings[item.providerId]}
                        photos={providerMedia[item.providerId]}
                        onSubscribe={(id) => {
                          const href = `/services/beach-club/checkout/plan/${id}`;
                          if (!isAuthenticated) openAuthModal("login", href);
                          else navigate(href);
                        }}
                      />
                    ),
                  )}
                </div>
              )}
            </>
          ) : (
            <YdEmptyState icon={Waves} title="No plans yet" subtitle="We're setting things up. Check back soon." />
          )}
        </section>

      </main>

      <BottomNav />
    </div>
  );
};

export default BeachClub;
