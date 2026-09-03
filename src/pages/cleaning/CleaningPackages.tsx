import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useArchetypeLabel } from "@/hooks/useServiceArchetypes";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { SearchX, SparklesIcon } from "lucide-react";
import { providerHref } from "@/lib/services/serviceUrls";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useResidenceFilter } from "@/hooks/useResidenceFilter";
import { useProviderRatings } from "@/hooks/useProviderRatings";
import { usePlanOffers } from "@/hooks/usePlanOffers";
import { resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";
import { useListingSearch } from "@/hooks/useListingSearch";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useI18n } from "@/i18n";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { QueryError } from "@/components/patterns/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { CleaningPackageCard } from "@/components/patterns/CleaningPackageCard";

interface CleaningProvider {
  id: string;
  name: string;
  /** Which category (Apartment Cleaning · Car Wash · …) this provider serves. */
  category_key: string | null;
  /** Bridge to `cleaning_packages.provider_id` (legacy id space). */
  source_provider_id: string | null;
  /** Hydrated from `cleaning_providers` via the bridge — writes go there. */
  avatar_url?: string | null;
  gallery_urls?: string[];
}

interface CleaningCategory {
  key: string;
  label: string;
  sort_order: number;
}

const CleaningPackages = () => {
  const navigate = useNavigate();
  // Back returns to where the visitor actually was; this path is only
  // the fallback for a cold landing. See hooks/useGoBack.
  const goBack = useGoBack("/discovery");
  const serviceTitle = useArchetypeLabel("cleaning", "Cleaning");
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();

  // Providers under the Cleaning archetype — same "top row" pattern as Food.
  // Currently one (EverySub Cleaning); adding a second is a data-only change.
  const providersQ = useQuery({
    queryKey: ["cleaning-providers-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, category_key, source_provider_id, avatar_url, gallery_urls")
        .eq("archetype_key", "cleaning")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // The profile lives on `providers` now — one row, one truth. This used
      // to bridge to cleaning_providers because that was where the Info tab
      // wrote; the tab writes here, so the detour is gone.
      return (data ?? []).map((p: any) => ({
        ...p,
        gallery_urls: Array.isArray(p.gallery_urls) ? p.gallery_urls.filter(Boolean) : [],
      })) as CleaningProvider[];
    },
  });

  // Categories under the Cleaning archetype (Apartment Cleaning · Car Wash · …).
  // Drives the top-level grouping — one section per category, then providers
  // inside, then plans inside each provider. Without this the page dumped a
  // flat grid where "Monthly Car Wash $29" sat next to "1 Bedroom Apartment $79"
  // with no visual signal that they're different services.
  const categoriesQ = useQuery({
    queryKey: ["cleaning-categories-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", "cleaning")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CleaningCategory[];
    },
  });

  const packagesQ = useQuery({
    queryKey: ["cleaning-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_packages")
        .select("*")
        // status is what the admin's Draft / Active / Archived control writes.
        // Without it, archiving a plan left it on sale and "Duplicate" — which
        // creates a draft copy — published "(Copy)" to the storefront instantly.
        .eq("status", "active")
        .eq("is_active", true)
        .eq("visibility", "public")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const list = data ?? [];
      const ids = list.map((p: any) => p.id);
      const { data: links } = ids.length
        ? await supabaseDb.from("cleaning_package_residences").select("package_id, residence_id").in("package_id", ids)
        : { data: [] as any[] };
      const resMap: Record<string, string[]> = {};
      (links ?? []).forEach((l: any) => { (resMap[l.package_id] ??= []).push(l.residence_id); });
      return list.map((p: any) => ({ ...p, residenceIds: resMap[p.id] ?? [] }));
    },
  });

  // ── Location filter ──────────────────────────────────────────────────────
  const { residence, servesHere } = useResidenceFilter();

  /**
   * Studio / 1BR / 2BR are one offer at three sizes, so the listing shows the
   * cheapest of them once, named for the offer. Picking the size happens at
   * checkout, where the customer is already telling us about their home.
   */
  const { offerBySourcePlanId, isLoading: offersLoading } = usePlanOffers(
    (providersQ.data ?? []).map((p: any) => p.id),
  );
  const visiblePackages = (packagesQ.data ?? [])
    .filter((p: any) => servesHere(p.residenceIds))
    .filter((pkg: any) => {
      const offer = offerBySourcePlanId.get(String(pkg.id));
      if (!offer) return true;
      const cheapest = offer.variants.reduce(
        (best, v) => (best === null || v.priceCents < best.priceCents ? v : best),
        null as null | { priceCents: number; sourcePlanId: string | null },
      );
      return cheapest?.sourcePlanId === String(pkg.id);
    });

  // Three-level grouping: category → provider → plans.
  //   Apartment Cleaning
  //     EverySub Cleaning
  //       Studio · 1BR · 2BR
  //   Car Wash
  //     EverySub Car Wash
  //       Monthly Car Wash
  // Providers without a category_key (legacy data) fall into "Other" at the
  // end — the schema NOT-NULLs this column so "Other" should stay empty
  // going forward, but we keep the bucket to survive any historical drift.
  interface ProviderGroup { providerId: string; providerName: string; providerAvatar: string | null; providerGallery: string[]; packages: any[] }
  interface CategoryGroup { categoryKey: string; categoryLabel: string; providers: ProviderGroup[] }

  const categoryGroups = useMemo((): CategoryGroup[] => {
    const providers = providersQ.data ?? [];
    const categories = categoriesQ.data ?? [];

    // Universal `providers.id` ≠ legacy `cleaning_packages.provider_id` —
    // bridge via `source_provider_id`. Match plans to providers via legacy id.
    const byLegacyId = new Map<string, CleaningProvider>();
    providers.forEach((p) => { if (p.source_provider_id) byLegacyId.set(p.source_provider_id, p); });

    // Build provider → packages, keeping only providers that actually have
    // visible plans in the current location filter.
    const packagesByProvider = new Map<string, any[]>();
    visiblePackages.forEach((pkg) => {
      const p = pkg.provider_id ? byLegacyId.get(pkg.provider_id) : null;
      if (!p) return;
      if (!packagesByProvider.has(p.id)) packagesByProvider.set(p.id, []);
      packagesByProvider.get(p.id)!.push(pkg);
    });

    // Group providers under their category, preserving both providersQ's
    // sort_order (providers within a category) and categoriesQ's sort_order.
    // Shared grouper so a category deactivated in admin drops its providers
    // into "Other" instead of erasing them from the page.
    const tiles = providers
      .filter((p) => (packagesByProvider.get(p.id) ?? []).length > 0) // no visible plans → hide the tile
      .map((p) => ({
        categoryKey: p.category_key,
        providerId: p.id,
        providerName: p.name,
        providerAvatar: p.avatar_url ?? null,
        providerGallery: p.gallery_urls ?? [],
        packages: packagesByProvider.get(p.id)!,
      }));

    return groupProvidersByCategory(tiles, categories, (t) => t.categoryKey).map((g) => ({
      categoryKey: g.key,
      categoryLabel: g.label,
      providers: g.providers,
    }));
  }, [visiblePackages, providersQ.data, categoriesQ.data]);

  // Ratings key off the universal provider id, which is what cleaning packages
  // carry in owner_provider_id — no bridge needed here.
  const ratings = useProviderRatings(
    (providersQ.data ?? []).map((p: any) => p.id),
  );

  // A card opens the plan's page, not the till — and looking needs no
  // account, so the login prompt waits until Subscribe.
  const openPlan = (pkgId: string) => navigate(`/services/cleaning/plans/${pkgId}`);

  // Rail = every provider with visible plans, flattened out of the category
  // groups. Chips = the categories those providers fall into.
  const railProviders = useMemo(
    () => categoryGroups.flatMap((c) =>
      c.providers.map((p) => ({
        id: p.providerId,
        name: p.providerName,
        avatarUrl: p.providerAvatar,
        gallery: p.providerGallery,
        // Category is redundant here — the chips right below say it.
        meta: `${p.packages.length} plan${p.packages.length !== 1 ? "s" : ""}`,
      }))),
    [categoryGroups],
  );
  const chipCategories = useMemo(
    () => categoryGroups.map((c) => ({
      key: c.categoryKey,
      label: c.categoryLabel,
      count: c.providers.reduce((n, p) => n + p.packages.length, 0),
    })),
    [categoryGroups],
  );
  const [activeCategory, setActiveCategory] = useCategoryParam();
  const visibleGroups = activeCategory === ALL_CATEGORIES
    ? categoryGroups
    : categoryGroups.filter((c) => c.categoryKey === activeCategory);

  const openProvider = (providerId: string) => {
    navigate(providerHref("cleaning", providerId));
  };

  /**
   * Browsing keeps the category → provider → plans grouping; searching or
   * sorting flattens it. A "cheapest first" list broken into three sections is
   * three separate answers to a question that has one.
   */
  const flatPackages = useMemo(
    () => visibleGroups.flatMap((category) =>
      category.providers.flatMap((provider: any) =>
        provider.packages.map((pkg: any) => ({
          pkg,
          providerId: provider.providerId as string,
          providerName: provider.providerName as string,
          gallery: provider.providerGallery as string[],
          categoryLabel: category.categoryLabel as string,
        })),
      ),
    ),
    [visibleGroups],
  );

  const search = useListingSearch(flatPackages, {
    text: (i) => [i.pkg.name, i.pkg.description, i.providerName, i.categoryLabel,
                  ...(Array.isArray(i.pkg.features) ? i.pkg.features : [])],
    price: (i) => resolveMonthlyPriceCents(i.pkg),
    rating: (i) => ratings[i.providerId]?.average ?? null,
    name: (i) => i.pkg.name ?? "",
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <DesktopHeader />
      <ListingHeader
        title={serviceTitle}
        onBack={goBack}
        query={search.query}
        onQueryChange={search.setQuery}
        placeholder={`Search ${serviceTitle}`}
        sort={search.sort}
        onSortChange={search.setSort}
        sorts={search.availableSorts}
      />

      <main className="app-container space-y-8 py-space-4 md:py-space-8">

        {/* Providers → Categories → the list. See components/listing/
            ListingNav — the same three-step shape on all four services. */}
        {!packagesQ.isLoading && !providersQ.isLoading && !categoriesQ.isLoading && categoryGroups.length > 0 && (
          <>
            <CategoryChips categories={chipCategories} value={activeCategory} onChange={setActiveCategory} />
            <ProviderRail providers={railProviders} icon={SparklesIcon} onOpen={openProvider} />
          </>
        )}

        {/* `offersLoading` belongs in this list: without it the three sizes of
            one plan each render as their own card until the offer lookup
            lands, and the customer watches them collapse into one. */}
        {packagesQ.isLoading || providersQ.isLoading || categoriesQ.isLoading || offersLoading ? (
          <section>
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-radius-lg bg-muted" />)}
            </div>
          </section>
        ) : providersQ.isError || packagesQ.isError ? (
          <QueryError
            title="Couldn't load the catalog"
            error={
              providersQ.error instanceof Error ? providersQ.error.message :
              packagesQ.error instanceof Error ? packagesQ.error.message :
              undefined
            }
            onRetry={() => { providersQ.refetch(); packagesQ.refetch(); categoriesQ.refetch(); }}
            retrying={providersQ.isFetching || packagesQ.isFetching || categoriesQ.isFetching}
          />
        ) : categoryGroups.length === 0 ? (
          <YdEmptyState
            icon={SparklesIcon}
            title={t("cleaning.noPackagesTitle")}
            subtitle={t("cleaning.noPackagesDescription")}
          />
        ) : (
          /**
           * One flat list of plans, the shape the other three services and the
           * design use. Cleaning used to break the list into a section per
           * category — which is the same cut the chips right above it already
           * make, so the page answered the same question twice and did it in
           * two different places.
           */
          <section className="space-y-3">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">Plans</h2>

            {search.results.length === 0 ? (
              <YdEmptyState icon={SearchX} title="No plans match" subtitle="Try a different word, or clear the search." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {search.results.map((item) => {
                  const offer = offerBySourcePlanId.get(String(item.pkg.id)) ?? null;
                  return (
                    <CleaningPackageCard
                      key={item.pkg.id}
                      pkg={item.pkg}
                      rating={ratings[item.providerId]}
                      offer={offer}
                      // The plan's own photos (its offer's gallery) first; the
                      // provider's only when the plan has none — the same rule
                      // as every other card, so one plan wears one picture.
                      photos={offer?.gallery?.length ? offer.gallery : item.gallery}
                      onSubscribe={openPlan}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

      </main>

      <BottomNav />
    </div>
  );
};

export default CleaningPackages;
