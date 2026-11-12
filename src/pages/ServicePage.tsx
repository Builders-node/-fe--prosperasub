import { useMemo, useState } from "react";
import { useSeo } from "@/hooks/useSeo";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { useQuery } from "@tanstack/react-query";
import { useProviderRatings } from "@/hooks/useProviderRatings";
import { useListingSearch } from "@/hooks/useListingSearch";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { providerHref } from "@/lib/services/serviceUrls";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { QueryError } from "@/components/patterns/QueryError";
import { UniversalPlanCard } from "@/components/patterns/UniversalPlanCard";
import { supabaseDb } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/patterns/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { PageLoader } from "@/components/ui/spinner";
import { SearchX } from "lucide-react";
import { useDraftPreview } from "@/hooks/useDraftPreview";
import { DraftPreviewBanner } from "@/components/patterns/DraftPreviewBanner";
import { DesktopListing, FilterGroup, featuredFirst, useDesktopFilters, usePromotionLookup, type ListingPlan } from "@/components/listing/DesktopListing";
import { planHref } from "@/lib/services/serviceUrls";
import { useOfferFacts } from "@/lib/services/serviceAreas";
import { useResidenceFilter } from "@/hooks/useResidenceFilter";
import { tagIcon, useTagDictionary } from "@/lib/tags";
import { cn } from "@/lib/utils";

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
  source_provider_id: string | null;
  source_service_key: string | null;
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
  // ?preview=1 for an admin: the service before it is switched on.
  const preview = useDraftPreview();
  const { archetypes, isLoading: archetypesLoading } = useServiceArchetypes(!preview);

  const archetype = archetypes.find((a) => a.key === archetypeKey);
  // Hooks before any early return (Rules of Hooks, see CLAUDE.md).
  useSeo({
    title: archetype ? `${archetype.label} in Roatán` : null,
    description: archetype
      ? (archetype as { description?: string | null }).description
        || `${archetype.label} from local businesses on Roatán — compare plans and subscribe on EverySub.`
      : null,
    path: archetypeKey ? `/services/${archetypeKey}` : null,
  });

  const providersQ = useQuery({
    queryKey: ["service-providers-public", archetypeKey, preview],
    queryFn: async () => {
      let q = supabaseDb
        .from("providers")
        .select("id, name, category_key, avatar_url, gallery_urls, source_provider_id, source_service_key")
        .eq("archetype_key", archetypeKey!);
      if (!preview) q = q.eq("status", "active");
      const { data, error } = await q.order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
    enabled: !!archetypeKey,
  });

  // The provider's gallery, as the FALLBACK for a plan without photos of its
  // own (the card prefers plan.gallery_urls — see UniversalPlanCard). The
  // avatar is deliberately not in this chain: it is a logo, and a logo
  // standing in a photo slot is why cards looked randomly illustrated.
  const providerMedia = useMemo(() => {
    const m: Record<string, string[]> = {};
    (providersQ.data ?? []).forEach((p: any) => {
      m[p.id] = Array.isArray(p.gallery_urls) ? p.gallery_urls : [];
    });
    return m;
  }, [providersQ.data]);
  const ratings = useProviderRatings((providersQ.data ?? []).map((p: any) => p.id));

  const categoriesQ = useQuery({
    queryKey: ["service-categories-public", archetypeKey, preview],
    queryFn: async () => {
      let q = supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", archetypeKey!);
      if (!preview) q = q.eq("is_active", true);
      const { data, error } = await q.order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; sort_order: number }>;
    },
    enabled: !!archetypeKey,
  });

  const plansQ = useQuery({
    queryKey: ["service-plans-public", archetypeKey, preview],
    queryFn: async () => {
      let q = supabaseDb
        .from("provider_plans")
        .select("id, provider_id, name, description, price_cents, currency, period, pricing_mode, tags, features, included_quantity, included_unit, gallery_urls, providers!inner(name, archetype_key, category_key)")
        .eq("providers.archetype_key", archetypeKey!);
      if (!preview) q = q.eq("status", "active");
      const { data, error } = await q
        // Private plans sell by link, not from the listing.
        .eq("visibility", "public")
        // Variants are reached by picking options on their offer, never listed
        // beside it — see hooks/usePlanOffers.
        .is("parent_plan_id", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!archetypeKey,
  });

  // ── Where you are, and what you eat ─────────────────────────────────────
  // Offers sold only in some residences (cleaning, food) drop out when the
  // visitor has chosen a place they don't serve; a business that serves none
  // of it goes with them. See lib/services/serviceAreas.
  const facts = useOfferFacts(archetypeKey, plansQ.data ?? [], providersQ.data ?? []).data;
  const { residence, servesHere, isFiltering } = useResidenceFilter();
  const servedPlans = useMemo(
    () => (plansQ.data ?? []).filter((p: any) =>
      servesHere(facts?.areas.get(String(p.id))) && servesHere(facts?.providerAreas.get(String(p.provider_id)))),
    [plansQ.data, facts, servesHere],
  );
  const hiddenHere = (plansQ.data ?? []).length - servedPlans.length;

  const [params, setParams] = useSearchParams();
  // Tags (lib/tags.ts): each dictionary group the shown plans use becomes a
  // filter. Inside a group a plan needs ANY chosen tag (Beginner or Advanced),
  // across groups ALL of them (Beginner AND Kids). ?tags=a,b in the URL.
  const dict = useTagDictionary();
  const chosenTags = (params.get("tags") ?? "").split(",").filter(Boolean);
  const toggleTag = (key: string) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    const cur = (out.get("tags") ?? "").split(",").filter(Boolean);
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    if (next.length) out.set("tags", next.join(",")); else out.delete("tags");
    return out;
  }, { replace: true });
  const tagsOf = (p: any): string[] => facts?.tags.get(String(p.id)) ?? (Array.isArray(p.tags) ? p.tags : []);
  const tagGroups = useMemo(() => {
    const seen = new Set(servedPlans.flatMap((p: any) => tagsOf(p)));
    return dict.groups
      .map((g) => ({ ...g, tags: g.tags.filter((t) => seen.has(t.key)) }))
      .filter((g) => g.tags.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servedPlans, facts, dict.groups]);
  const matchesTags = (p: any) => {
    if (!chosenTags.length) return true;
    const own = new Set(tagsOf(p));
    return tagGroups.every((g) => {
      const picked = g.tags.filter((t) => chosenTags.includes(t.key));
      return picked.length === 0 || picked.some((t) => own.has(t.key));
    });
  };

  const providerGroups = useMemo(() => {
    // A business stays on the page while it has something sold here — or
    // nothing listed at all yet (its "coming soon" is still worth seeing).
    const all = plansQ.data ?? [];
    const served = new Set(servedPlans.map((p: any) => String(p.provider_id)));
    const listed = new Set(all.map((p: any) => String(p.provider_id)));
    const shown = (providersQ.data ?? []).filter((p) => served.has(p.id) || !listed.has(p.id));
    return groupProvidersByCategory<ProviderRow>(shown, categoriesQ.data ?? [], (p) => p.category_key);
  }, [providersQ.data, categoriesQ.data, plansQ.data, servedPlans]);

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
    let rows = servedPlans;
    if (activeCategory !== ALL_CATEGORIES) rows = rows.filter((r: any) => r.providers?.category_key === activeCategory);
    rows = rows.filter(matchesTags);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servedPlans, activeCategory, chosenTags.join(","), facts, tagGroups]);

  /** A group's tags as chips — the sidebar on a laptop, a row above the list on a phone. */
  const tagChips = (tags: Array<{ key: string; label: string }>, size: "sm" | "md") => tags.map((t) => {
    const TagIcon = tagIcon(t.key);
    const on = chosenTags.includes(t.key);
    return (
      <button
        key={t.key}
        type="button"
        aria-pressed={on}
        onClick={() => toggleTag(t.key)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold transition-colors",
          size === "md" ? "h-10 text-[14px]" : "h-8 text-[13px]",
          on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70",
        )}
      >
        {TagIcon && <TagIcon className="h-4 w-4" />}
        {t.label}
      </button>
    );
  });
  const hiddenNotice = isFiltering && hiddenHere > 0 ? (
    <p className="text-[14px] text-muted-foreground">
      {hiddenHere} {hiddenHere === 1 ? "plan isn't" : "plans aren't"} available in {residence}
    </p>
  ) : null;

  const search = useListingSearch(visiblePlans, {
    // Tags by key AND by label: "kids" and "Good for kids" both find it.
    text: (p: any) => [p.name, p.description, p.providers?.name, ...(Array.isArray(p.features) ? p.features : []),
      ...tagsOf(p), ...dict.labelsOf(tagsOf(p))],
    price: (p: any) => p.price_cents,
    rating: (p: any) => ratings[p.provider_id]?.average ?? null,
    name: (p: any) => p.name ?? "",
  });

  // Paid placements stand FIRST in the list, marked — not in a section of
  // their own.
  const lookupPromotion = usePromotionLookup(archetypeKey);
  const promotionOf = (plan: any) => lookupPromotion([plan.id], [plan.provider_id]);
  const ordered = featuredFirst(search.results, (p: any) => !!promotionOf(p));

  const filters = useDesktopFilters();
  const providerNames = useMemo(() => new Map((providersQ.data ?? []).map((p) => [p.id, p])), [providersQ.data]);
  const desktopPlans: ListingPlan[] = filters.apply(ordered.map((plan: any) => {
    const own = Array.isArray(plan.gallery_urls) ? plan.gallery_urls.filter((u: unknown) => typeof u === "string" && u) : [];
    return {
      id: String(plan.id),
      name: plan.name,
      providerId: String(plan.provider_id),
      providerName: plan.providers?.name ?? providerNames.get(plan.provider_id)?.name ?? "",
      priceCents: typeof plan.price_cents === "number" ? plan.price_cents : null,
      period: plan.period ?? null,
      perPerson: plan.pricing_mode === "per_person",
      photos: own.length ? own : (providerMedia[plan.provider_id] ?? []),
      href: planHref(archetypeKey ?? "", String(plan.id)) + (preview ? "?preview=1" : ""),
      rating: ratings[plan.provider_id] ?? null,
      promotionId: promotionOf(plan),
      tags: dict.labelsOf(tagsOf(plan), 2),
    };
  }));
  const desktopBusinesses = useMemo(() => {
    const visible = new Set(visiblePlans.map((p: any) => String(p.provider_id)));
    return (providersQ.data ?? [])
      .filter((p) => visible.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatar_url ?? null }));
  }, [providersQ.data, visiblePlans]);

  const Icon = archetype?.Icon;

  // The archetype list decides whether this is a real service. Rendering an
  // empty listing for a typo'd URL would look like a business that closed.
  if (archetypesLoading) return <PageLoader />;
  if (!archetype) {
    return (
      <BrowseLayout>
        <HomeHeader title="Not found" showBackButton onBack={goBack} />
        <main className="app-container py-space-8">
          <YdEmptyState
            icon={SearchX}
            title="No such service"
            subtitle="This service isn't on the platform. Browse what is."
          />
        </main>
      </BrowseLayout>
    );
  }

  const keep = preview ? "?preview=1" : "";
  const openProvider = (providerId: string) => navigate(providerHref(archetype.key, providerId) + keep);
  const openPlan = (planId: string) => navigate(`/services/${archetype.key}/plans/${planId}${keep}`);

  return (
    <BrowseLayout>
      {/* The archetype's own label — the same word the tile used and the same
          one the admin typed. */}
      <ListingHeader
        title={archetype.label}
        onBack={goBack}
        query={search.query}
        onQueryChange={search.setQuery}
        placeholder={`Search ${archetype.label}`}
        sort={search.sort}
        onSortChange={search.setSort}
        sorts={search.availableSorts}
        desktopBar={false}
      />

      {preview && <div className="app-container hidden pt-space-4 md:block"><DraftPreviewBanner /></div>}
      <DesktopListing
        title={archetype.label}
        categories={chips.map((c) => ({ key: c.key, label: c.label }))}
        category={activeCategory}
        onCategory={setActiveCategory}
        businesses={desktopBusinesses}
        plans={desktopPlans}
        loading={plansQ.isLoading || providersQ.isLoading}
        sort={search.sort}
        sorts={search.availableSorts}
        onSort={search.setSort}
        filters={filters}
        extraFilters={tagGroups.length > 0 ? (
          <>
            {tagGroups.map((g) => (
              <FilterGroup key={g.key} title={g.label}>
                <div className="flex flex-wrap gap-2">{tagChips(g.tags, "md")}</div>
              </FilterGroup>
            ))}
          </>
        ) : null}
        notice={hiddenNotice}
        empty={plansQ.isError ? (
          <QueryError
            title="Couldn't load plans"
            error={plansQ.error instanceof Error ? plansQ.error.message : undefined}
            onRetry={() => plansQ.refetch()}
            retrying={plansQ.isFetching}
          />
        ) : (visiblePlans.length === 0 ? (
          isFiltering && hiddenHere > 0
            ? <YdEmptyState icon={Icon} title={`Nothing in ${residence} yet`} subtitle="Try another location or check back soon." />
            : <YdEmptyState icon={Icon} title="No plans yet" subtitle="We're setting things up. Check back soon." />
        ) : undefined)}
      />

      {/* The phone: search, category chips, businesses, the list. */}
      <main className="app-container py-space-4 md:hidden">
        {preview && <div className="mb-4"><DraftPreviewBanner /></div>}
        {providersQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {[1, 2].map((i) => <Skeleton key={i} className="h-72" />)}
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
          <h2 className="mb-3 text-heading font-semibold text-foreground">Plans</h2>
          {tagGroups.length > 0 && (
            <div className="-mx-space-4 mb-3 flex gap-2 overflow-x-auto px-space-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tagChips(tagGroups.flatMap((g) => g.tags), "sm")}
            </div>
          )}
          {hiddenNotice && <div className="mb-3">{hiddenNotice}</div>}

          {plansQ.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
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
                  {ordered.map((plan: any) => (
                    <UniversalPlanCard
                      key={plan.id}
                      plan={plan}
                      featured={!!promotionOf(plan)}
                      featuredLabel="Featured"
                      tags={dict.labelsOf(tagsOf(plan), 2)}
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

    </BrowseLayout>
  );
};

export default ServicePage;
