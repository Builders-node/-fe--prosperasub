import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Building2 } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { useGoBack } from "@/hooks/useGoBack";
import { Spinner } from "@/components/ui/spinner";
import { QueryError } from "@/components/patterns/QueryError";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { YdSectionHeading, YdEmptyState } from "@/components/yd/YdPrimitives";
import { carProviderPath } from "../lib/routes";
import { VehicleCard } from "../components/VehicleCard";
import { useVehicles } from "../hooks/useVehicles";
import { useVehicleTypes } from "../hooks/useVehicleTypes";
import { useListingSearch } from "@/hooks/useListingSearch";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { useSearchParams } from "react-router-dom";
import { DesktopListing, FilterGroup, useDesktopFilters, type ListingPlan } from "@/components/listing/DesktopListing";
import { carPath as vehicleHref } from "../lib/routes";
import { cn } from "@/lib/utils";

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
   * The unit's own vehicle types, as chips. With one type the chips hide
   * themselves; a second (motorbikes, boats) appears here with no code.
   */
  const categoriesQ = useVehicleTypes();
  const [activeCategory, setActiveCategory] = useCategoryParam();
  /** A vehicle's type is its own — the business has none. */
  const typeOf = (v: { category_key?: string | null }) => v.category_key ?? null;
  const inCategory = (v: { category_key?: string | null }) =>
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

  /**
   * The rail is drawn on every listing, and ProviderRail already knows what to
   * do with one business: a full-width row rather than a lone half tile. This
   * page used to hide it below two providers, so the one section on the
   * platform with a single company was also the one with no door to it.
   *
   * Naming the business on every ROW is still gated: with one company that is
   * the same word repeated down the page.
   */
  const manyProviders = providers.length > 1;

  const scoped = useMemo(
    () => vehicles
      .filter((v) => (providerId ? v.provider?.id === providerId : true))
      .filter(inCategory),
    [vehicles, providerId, activeCategory],
  );

  // Search and sort in the URL, like every other listing — a filtered fleet can
  // be shared, survives a reload and comes back on Back.
  const search = useListingSearch(scoped, {
    text: (v) => [v.name, v.brand, v.model, String(v.year), v.provider?.name],
    price: (v) => v.daily_price_cents,
    name: (v) => v.name,
  });

  const shown = search.results;

  /**
   * The laptop: the same listing as every service (DesktopListing) — the
   * filters on the left, cards on the right. Cars add what decides a car:
   * how many seats and which gearbox (?seats= ?gear=, in the URL like the rest).
   */
  const filters = useDesktopFilters();
  const [params, setParams] = useSearchParams();
  const minSeats = Number(params.get("seats")) || 0;
  const gear = params.get("gear");
  const setParam = (k: string, v: string | null) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    if (v) out.set(k, v); else out.delete(k);
    return out;
  }, { replace: true });
  const seatOptions = useMemo(() => [...new Set(vehicles.map((v) => v.seats).filter((n) => n > 0))].sort((a, b) => a - b), [vehicles]);
  const gears = useMemo(() => [...new Set(vehicles.map((v) => v.transmission))], [vehicles]);

  const desktopVehicles: ListingPlan[] = useMemo(() => filters.apply(
    search.results
      // The provider rail narrows the phone; the laptop narrows by the Businesses filter.
      .filter((v) => (minSeats ? v.seats >= minSeats : true))
      .filter((v) => (gear ? v.transmission === gear : true))
      .map((v) => ({
        id: v.id,
        name: v.name,
        providerId: v.provider?.id ?? "",
        providerName: v.provider?.name ?? "",
        priceCents: v.daily_price_cents,
        period: null,
        perPerson: false,
        photos: [v.image_url, ...(v.gallery_urls ?? [])].filter((u): u is string => !!u),
        href: vehicleHref(`vehicle/${v.id}`),
        rating: null,
        promotionId: null,
        unit: "day",
        favoriteKind: "vehicle" as const,
        tags: [
          `${v.seats} seats`,
          v.transmission === "automatic" ? "Auto" : "Manual",
          ...(v.air_conditioning ? ["A/C"] : []),
        ],
      })),
  ), [search.results, filters, minSeats, gear]);

  const chip = (on: boolean) => cn(
    "h-10 rounded-full px-4 text-[14px] font-semibold transition-colors",
    on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70",
  );

  return (
    // The platform's listing frame — the same one every other listing sits in.
    // This page used to be a bare <div> that mounted DesktopHeader itself and
    // took its tab bar from the section shell: the same screen, assembled by
    // hand, and therefore free to drift.
    <BrowseLayout header={<ListingHeader
        title="Vehicles"
        onBack={goBack}
        query={search.query}
        onQueryChange={search.setQuery}
        placeholder="Search vehicles"
        sort={search.sort}
        onSortChange={search.setSort}
        sorts={search.availableSorts}
        // A vehicle is collected, or delivered to an address given at
        // checkout — narrowing by residence would filter nothing.
        showLocation={false}
        desktopBar={false}
      />}>
      <DesktopListing
        title="Vehicles"
        categories={(categoriesQ.data ?? []).map((c) => ({ key: c.key, label: c.label }))}
        category={activeCategory}
        onCategory={setActiveCategory}
        businesses={providers.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }))}
        plans={desktopVehicles}
        loading={isLoading}
        sort={search.sort}
        sorts={search.availableSorts}
        onSort={search.setSort}
        filters={filters}
        noun={["vehicle", "vehicles"]}
        extraFilters={
          <>
            {seatOptions.length > 1 && (
              <FilterGroup title="Seats">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={chip(!minSeats)} onClick={() => setParam("seats", null)}>Any</button>
                  {seatOptions.map((n) => (
                    <button key={n} type="button" className={chip(minSeats === n)} onClick={() => setParam("seats", minSeats === n ? null : String(n))}>
                      {n}+
                    </button>
                  ))}
                </div>
              </FilterGroup>
            )}
            {gears.length > 1 && (
              <FilterGroup title="Gearbox">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={chip(!gear)} onClick={() => setParam("gear", null)}>Any</button>
                  {gears.map((g) => (
                    <button key={g} type="button" className={chip(gear === g)} onClick={() => setParam("gear", gear === g ? null : g)}>
                      {g === "automatic" ? "Automatic" : "Manual"}
                    </button>
                  ))}
                </div>
              </FilterGroup>
            )}
          </>
        }
        empty={isError
          ? <QueryError title="Couldn't load vehicles" error={error} onRetry={() => void refetch()} />
          : <YdEmptyState icon={Car} title={vehicles.length ? "No vehicles match" : "No vehicles available yet"}
              subtitle={vehicles.length ? "Try other filters, or reset them." : "Check back soon."} />}
      />
      {/* The phone: chips, the rental companies, the list. */}
      <AppContainer className="py-space-4 md:hidden">
        <CategoryChips
          categories={(categoriesQ.data ?? []).map((c) => ({
            key: c.key,
            label: c.label,
            count: vehicles.filter((v) => typeOf(v) === c.key).length,
          }))}
          value={activeCategory}
          onChange={setActiveCategory}
        />
        {providers.length > 0 && (
          <div className="mb-6 mt-4">
            <ProviderRail
              providers={providers.map((p) => ({
                id: p.id,
                name: p.name,
                avatarUrl: p.avatarUrl ?? null,
                meta: `${p.count} vehicle${p.count === 1 ? "" : "s"}`,
              }))}
              icon={Building2}
              label="Rental companies"
              // The rail is a DOOR, as on every other listing — it opens the
              // business's own page (fleet shelf, reviews, gallery). Narrowing
              // the grid is the chips' job, not the rail's.
              onOpen={(id) => navigate(carProviderPath(id))}
            />
          </div>
        )}

        <YdSectionHeading
          title={providerId ? providers.find((p) => p.id === providerId)?.name ?? "Available vehicles" : "Available vehicles"}
          count={!isLoading && !isError ? shown.length : null}
        />

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : isError ? (
          <QueryError title="Couldn't load vehicles" error={error} onRetry={() => void refetch()} />
        ) : shown.length === 0 ? (
          <YdEmptyState
            icon={Car}
            title={search.isActive ? "No vehicles match your search" : "No vehicles available yet"}
            subtitle={search.isActive ? "Try a different word." : "Check back soon."}
          />
        ) : (
          // Two columns on a laptop — one full-width row per car left half
          // the screen empty.
          <div className="grid gap-2 md:grid-cols-2">
            {shown.map((v) => <VehicleCard key={v.id} v={v} showProvider={manyProviders} />)}
          </div>
        )}
      </AppContainer>
    </BrowseLayout>
  );
}
