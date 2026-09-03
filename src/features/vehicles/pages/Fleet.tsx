import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Building2 } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { useGoBack } from "@/hooks/useGoBack";
import { Spinner } from "@/components/ui/spinner";
import { QueryError } from "@/components/patterns/QueryError";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { providerHref } from "@/lib/services/serviceUrls";
import { YdSectionHeading } from "@/components/yd/YdPrimitives";
import { VehicleCard } from "../components/VehicleCard";
import { useVehicles } from "../hooks/useVehicles";
import { useListingSearch } from "@/hooks/useListingSearch";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * The fleet, built out of the same pieces as every other listing.
 *
 * It used to be its own thing — a hero paragraph, a hand-rolled `<input>`, and
 * cards with a full-width photo and a Book button each. None of that was worse
 * in isolation; it was just a second design of a screen the app already has
 * four of, so cars visibly belonged to a different product.
 *
 * Now: the platform's search + sort row, its provider rail, its section
 * heading with a count, and its listing row (see VehicleCard). What stays
 * particular to cars is what actually differs — a day rate, and the specs that
 * decide whether a car is the right one.
 */
export default function Fleet() {
  const navigate = useNavigate();
  const goBack = useGoBack("/discovery");
  const { data: vehicles = [], isLoading, isError, error, refetch } = useVehicles();
  const [providerId, setProviderId] = useState<string | null>(null);

  /**
   * Categories under the vehicles archetype, as chips — the same narrowing
   * control every other listing has. With one category (Car Rental today) the
   * chips hide themselves; a second (motorbikes, boats) appears here with no
   * code, exactly as it does on Cleaning.
   */
  const categoriesQ = useQuery({
    queryKey: ["vehicles-categories-public"],
    queryFn: async () => {
      const { data, error: err } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", "vehicles")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (err) throw err;
      return (data ?? []) as Array<{ key: string; label: string; sort_order: number }>;
    },
  });
  const providerCategoryQ = useQuery({
    queryKey: ["vehicles-provider-categories"],
    queryFn: async () => {
      const { data, error: err } = await supabaseDb
        .from("providers")
        .select("id, category_key")
        .eq("archetype_key", "vehicles");
      if (err) throw err;
      const m: Record<string, string | null> = {};
      (data ?? []).forEach((r: any) => { m[String(r.id)] = r.category_key ?? null; });
      return m;
    },
  });
  const [activeCategory, setActiveCategory] = useCategoryParam();
  /**
   * A vehicle's type is its OWN `category_key` — one company can rent cars
   * and motorbikes, and the chips must split that fleet. A row that predates
   * the column (NULL) inherits its provider's category, so nothing vanishes.
   */
  const typeOf = (v: { category_key?: string | null; provider?: { id: string } | null }) =>
    v.category_key ?? (v.provider?.id ? (providerCategoryQ.data ?? {})[v.provider.id] ?? null : null);
  const inCategory = (v: { category_key?: string | null; provider?: { id: string } | null }) =>
    activeCategory === ALL_CATEGORIES || typeOf(v) === activeCategory;

  /**
   * The businesses with a car listed right now — derived from the fleet rather
   * than fetched, so a company that has been approved but has added no car
   * does not appear as a rail tile leading to nothing.
   */
  const providers = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; avatarUrl: string | null; count: number }>();
    vehicles.forEach((v) => {
      if (!v.provider?.id || !v.provider.name) return;
      const hit = seen.get(v.provider.id);
      if (hit) hit.count += 1;
      else seen.set(v.provider.id, { id: v.provider.id, name: v.provider.name, avatarUrl: v.provider.avatar_url ?? null, count: 1 });
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [vehicles]);

  // One rental company is the current state; a rail of one and a name on every
  // row would be chrome around a choice nobody has.
  const manyProviders = providers.length > 1;

  const scoped = useMemo(
    () => vehicles
      .filter((v) => (providerId ? v.provider?.id === providerId : true))
      .filter(inCategory),
    [vehicles, providerId, activeCategory, providerCategoryQ.data],
  );

  // Search and sort in the URL, like every other listing — a filtered fleet can
  // be shared, survives a reload and comes back on Back.
  const search = useListingSearch(scoped, {
    text: (v) => [v.name, v.brand, v.model, String(v.year), v.provider?.name],
    price: (v) => v.daily_price_cents,
    name: (v) => v.name,
  });

  const shown = search.results;

  return (
    <div>
      {/* The same two components the food, cleaning and beach listings are
          topped with — not a lookalike. ListingHeader carries the title bar,
          the search field and the sort behind the filter button. */}
      <DesktopHeader />
      <ListingHeader
        title="Car Rental"
        onBack={goBack}
        query={search.query}
        onQueryChange={search.setQuery}
        placeholder="Search Car Rental"
        sort={search.sort}
        onSortChange={search.setSort}
        sorts={search.availableSorts}
        // A car is collected, or delivered to an address given at checkout —
        // narrowing the fleet by residence would filter nothing.
        showLocation={false}
      />
      <AppContainer className="py-space-4 md:py-space-8">
        <CategoryChips
          categories={(categoriesQ.data ?? []).map((c) => ({
            key: c.key,
            label: c.label,
            count: vehicles.filter((v) => typeOf(v) === c.key).length,
          }))}
          value={activeCategory}
          onChange={setActiveCategory}
        />
        {manyProviders && (
          <div className="mb-6 mt-4">
            <ProviderRail
              providers={providers.map((p) => ({
                id: p.id,
                name: p.name,
                avatarUrl: p.avatarUrl ?? null,
                meta: `${p.count} car${p.count === 1 ? "" : "s"}`,
              }))}
              icon={Building2}
              label="Providers"
              // The rail is a DOOR, as on every other listing — it opens the
              // business's own page (fleet shelf, reviews, gallery). Narrowing
              // the grid is the chips' job, not the rail's.
              onOpen={(id) => navigate(providerHref("vehicles", id))}
            />
          </div>
        )}

        <YdSectionHeading
          title={providerId ? providers.find((p) => p.id === providerId)?.name ?? "Available cars" : "Available cars"}
          count={!isLoading && !isError ? shown.length : null}
        />

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : isError ? (
          <QueryError title="Couldn't load the fleet" error={error} onRetry={() => void refetch()} />
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center rounded-radius-md bg-card py-14 text-center">
            <Car className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">
              {search.isActive ? "No cars match your search" : "No cars available yet"}
            </p>
            <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
              {search.isActive ? "Try a different word." : "Check back soon."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((v) => <VehicleCard key={v.id} v={v} showProvider={manyProviders} />)}
          </div>
        )}
      </AppContainer>
    </div>
  );
}
