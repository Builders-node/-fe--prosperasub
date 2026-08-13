import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useArchetypeLabel } from "@/hooks/useServiceArchetypes";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { Car, CalendarDays, Pencil, SearchX } from "lucide-react";
import { format, parseISO } from "date-fns";
import { providerHref } from "@/lib/services/serviceUrls";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { useCategoryParam } from "@/hooks/useCategoryParam";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { supabaseDb } from "@/integrations/supabase/client";
import { useResidenceFilter } from "@/hooks/useResidenceFilter";
import { useListingSearch } from "@/hooks/useListingSearch";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { QueryError } from "@/components/QueryError";
import { RentalVehicleCard } from "@/components/patterns/RentalVehicleCard";
import { Button } from "@/components/ui/button";
import { RentalCalendar } from "@/components/rental/RentalCalendar";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import type { RentalVehicle, RentalVehicleImage } from "@/types/carRental";

const TIME_OPTIONS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const fmt12 = (t: string) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

const CarRental = () => {
  const navigate = useNavigate();
  // Back returns to where the visitor actually was; this path is only
  // the fallback for a cold landing. See hooks/useGoBack.
  const goBack = useGoBack("/discovery");
  const serviceTitle = useArchetypeLabel("rental", "Rental");
  const [searchParams, setSearchParams] = useSearchParams();

  // ─── Listing-level date filter (carried into each car's booking flow) ───────
  const [startDate, setStartDate] = useState(() => searchParams.get("start") ?? "");
  const [endDate, setEndDate] = useState(() => searchParams.get("end") ?? "");
  const [startTime, setStartTime] = useState(() => searchParams.get("startTime") ?? "09:00");
  const [endTime, setEndTime] = useState(() => searchParams.get("endTime") ?? "09:00");
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const hasRange = !!startDate && !!endDate;
  const rangeLabel = hasRange
    ? `${format(parseISO(startDate), "d MMM")} · ${fmt12(startTime)} — ${format(parseISO(endDate), "d MMM")} · ${fmt12(endTime)}`
    : null;

  /** Append the selected dates so the detail/booking flow pre-fills. */
  const datesQuery = () => {
    if (!hasRange) return "";
    return `?${new URLSearchParams({ start: startDate, end: endDate, startTime, endTime }).toString()}`;
  };

  const applyDates = () => {
    const next = new URLSearchParams(searchParams);
    if (hasRange) {
      next.set("start", startDate);
      next.set("end", endDate);
      next.set("startTime", startTime);
      next.set("endTime", endTime);
      setSearchParams(next, { replace: true });
    }
    setDateSheetOpen(false);
  };

  // Providers under the Rental archetype — top-row of the listing, same
  // pattern as Food. Tap = scroll to the vehicles section.
  const providersQ = useQuery({
    queryKey: ["rental-providers-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, category_key, avatar_url, gallery_urls")
        .eq("archetype_key", "rental")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; category_key: string | null }[];
    },
  });

  // Categories under the Rental archetype — today just "Vehicle Rental", but
  // grouping providers by category future-proofs the page for scooters, boats
  // or bicycle rentals landing as their own category later.
  const categoriesQ = useQuery({
    queryKey: ["rental-categories-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", "rental")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; sort_order: number }>;
    },
  });

  const providerGroups = useMemo(
    () => groupProvidersByCategory(providersQ.data ?? [], categoriesQ.data ?? [], (p) => p.category_key),
    [providersQ.data, categoriesQ.data],
  );

  const { data: vehicles, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["rental-vehicles-public"],
    queryFn: async () => {
      const { data: vData, error } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .eq("status", "public")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      if (!vData || vData.length === 0) return [] as (RentalVehicle & { images: RentalVehicleImage[] })[];

      const ids = vData.map((v) => v.id);
      const { data: imgData } = await supabaseDb
        .from("rental_vehicle_images")
        .select("*")
        .in("vehicle_id", ids)
        .order("sort_order", { ascending: true });

      const imgMap: Record<string, RentalVehicleImage[]> = {};
      (imgData ?? []).forEach((img: RentalVehicleImage) => {
        if (!imgMap[img.vehicle_id]) imgMap[img.vehicle_id] = [];
        imgMap[img.vehicle_id].push(img);
      });

      // Location availability per vehicle (empty = everywhere).
      const { data: links } = await supabaseDb
        .from("rental_vehicle_residences").select("vehicle_id, residence_id").in("vehicle_id", ids);
      const resMap: Record<string, string[]> = {};
      (links ?? []).forEach((l: any) => { (resMap[l.vehicle_id] ??= []).push(l.residence_id); });

      return vData.map((v: RentalVehicle) => ({ ...v, images: imgMap[v.id] ?? [], residenceIds: resMap[v.id] ?? [] }));
    },
  });

  // ── Location filter ──────────────────────────────────────────────────────
  const { residence, servesHere, isFiltering } = useResidenceFilter();
  const visibleVehicles = (vehicles ?? []).filter((v: any) => servesHere(v.residenceIds));
  const hiddenVehicleCount = (vehicles ?? []).length - visibleVehicles.length;

  // Cars are the one listing where the customer already knows the vocabulary —
  // "toyota", "automatic", "7 seats" — so the search reads the spec columns as
  // well as the name.
  const search = useListingSearch(visibleVehicles, {
    text: (v: any) => [v.name, v.brand, v.model, v.description, v.transmission, v.fuel_type,
                       v.year ? String(v.year) : null, v.seats ? `${v.seats} seats` : null],
    price: (v: any) => v.daily_price_cents,
    name: (v: any) => v.name ?? "",
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
  // NOTE: the chip narrows the rail only. `rental_vehicles` rows carry no
  // provider column, so a vehicle cannot be traced back to a category — the
  // grid below stays whole. Wire vehicles to their provider and this filter
  // can cover them too.
  const visibleRail = activeCategory === ALL_CATEGORIES
    ? railProviders
    : providerGroups
        .filter((g) => g.key === activeCategory)
        .flatMap((g) => g.providers.map((p: any) => ({
          id: p.id, name: p.name, avatarUrl: p.avatar_url ?? null,
          gallery: p.gallery_urls ?? [], meta: g.label,
        })));

  const openProvider = (providerId: string) => {
    navigate(providerHref("rental", providerId));
  };

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

      <main className="market-content space-y-8 py-space-4 md:py-space-8">

        {/* Date filter bar (Yandex Prokat style) — kept up top so users can
            scope availability before browsing. */}
        <button
          type="button"
          onClick={() => setDateSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left transition-colors hover:bg-muted/30"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            {rangeLabel ? (
              <>
                <p className="text-xs text-muted-foreground">Pickup &amp; return</p>
                <p className="font-bold text-foreground">{rangeLabel}</p>
              </>
            ) : (
              <>
                <p className="font-bold text-foreground">Select rental dates</p>
                <p className="text-xs text-muted-foreground">Choose pickup &amp; return to carry into booking</p>
              </>
            )}
          </div>
          <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {/* ─── Providers grouped by category ──────────────────────────
            One section per rental category (Vehicle Rental today; future:
            Scooters, Boats, Bicycles). Header hides for single-category
            archetypes so the page stays clean today. */}
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
          <YdEmptyState icon={Car} title="No providers yet" subtitle="We're setting things up. Check back soon." />
        ) : (
          <div className="space-y-4">
            <CategoryChips categories={chipCategories} value={activeCategory} onChange={setActiveCategory} />
            <ProviderRail providers={visibleRail} icon={Car} onOpen={openProvider} />
          </div>
        )}

        {/* ─── Vehicles ──────────────────────────────────────────── */}
        <section id="rental-vehicles" className="scroll-mt-4">
          <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.4px] text-foreground">Vehicles</h2>

        {/* Vehicle grid */}
        {isLoading ? (
          <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[380px] animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <QueryError
            title="Couldn't load vehicles"
            error={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : visibleVehicles.length > 0 ? (
          <>
          {search.results.length === 0 ? (
            <YdEmptyState icon={SearchX} title="No cars match" subtitle="Try a different word, or clear the search." />
          ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {search.results.map((v: any, idx: number) => (
              <RentalVehicleCard
                key={v.id}
                v={v}
                featured={!search.isActive && idx === 1 && search.results.length > 1}
                onOpen={(id) => navigate(`/services/rental/${id}${datesQuery()}`)}
              />
            ))}
          </div>
          )}
          {hiddenVehicleCount > 0 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {hiddenVehicleCount} vehicle{hiddenVehicleCount > 1 ? "s" : ""} not available in {residence}
            </p>
          )}
          </>
        ) : isFiltering ? (
          <YdEmptyState
            icon={Car}
            title={`No vehicles in ${residence} yet`}
            subtitle="Try another location or check back soon."
          />
        ) : (
          <YdEmptyState
            icon={Car}
            title="No vehicles yet"
            subtitle="We're setting things up. Check back soon."
          />
        )}
        </section>
      </main>

      {/* ─── Date selection sheet ──────────────────────────────────────────── */}
      <ResponsiveDialog
        open={dateSheetOpen}
        onOpenChange={setDateSheetOpen}
        title="Select rental dates"
        sheetClassName="h-[92vh]"
        footer={
          <Button
            size="lg"
            className="h-12 w-full rounded-2xl font-bold"
            onClick={applyDates}
            disabled={!hasRange || !!calendarError}
          >
            {hasRange ? "Apply dates" : "Pick a date range"}
          </Button>
        }
      >
        <RentalCalendar
          vehicleId=""
          startDate={startDate}
          endDate={endDate}
          onRangeChange={(s, e) => { setStartDate(s); setEndDate(e); }}
          onError={setCalendarError}
          maxDays={30}
          pickupTime={startTime}
          dropoffTime={endTime}
          timeOptions={TIME_OPTIONS}
          onPickupTimeChange={setStartTime}
          onDropoffTimeChange={setEndTime}
        />
        {calendarError && (
          <p className="mt-3 text-center text-sm font-medium text-destructive">{calendarError}</p>
        )}
      </ResponsiveDialog>

      <BottomNav />
    </div>
  );
};

export default CarRental;
