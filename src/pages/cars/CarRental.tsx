import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Car, CalendarDays, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { useResidences } from "@/hooks/useResidences";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { QueryError } from "@/components/QueryError";
import { RentalVehicleCard } from "@/components/patterns/RentalVehicleCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
        .select("id, name")
        .eq("archetype_key", "rental")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; }[];
    },
  });

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
  const { residence } = useSelectedResidence();
  const { data: residences = [] } = useResidences();
  const selectedResidenceId = residence ? (residences.find((r) => r.name === residence)?.id ?? null) : null;
  const visibleVehicles = (vehicles ?? []).filter(
    (v: any) => !selectedResidenceId || (v.residenceIds?.length ?? 0) === 0 || v.residenceIds.includes(selectedResidenceId),
  );
  const hiddenVehicleCount = (vehicles ?? []).length - visibleVehicles.length;

  const openProvider = (providerId: string) => {
    navigate(`/services/rental/providers/${providerId}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Rental" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

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

        {/* ─── Providers ──────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Providers</h2>
          {providersQ.isLoading ? (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : providersQ.isError ? (
            <QueryError
              title="Couldn't load providers"
              error={providersQ.error instanceof Error ? providersQ.error.message : undefined}
              onRetry={() => providersQ.refetch()}
              retrying={providersQ.isFetching}
            />
          ) : providersQ.data && providersQ.data.length > 0 ? (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {providersQ.data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProvider(p.id)}
                  className="flex h-28 items-center justify-center rounded-3xl border border-border bg-card px-6 text-center transition-colors hover:border-primary/40"
                >
                  <span className="text-2xl font-black tracking-tight text-foreground">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <YdEmptyState icon={Car} title="No providers yet" subtitle="We're setting things up. Check back soon." />
          )}
        </section>

        {/* ─── Vehicles ──────────────────────────────────────────── */}
        <section id="rental-vehicles" className="scroll-mt-4">
          <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Vehicles</h2>

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleVehicles.map((v, idx) => (
              <RentalVehicleCard
                key={v.id}
                v={v}
                featured={idx === 1 && visibleVehicles.length > 1}
                onOpen={(id) => navigate(`/services/rental/${id}${datesQuery()}`)}
              />
            ))}
          </div>
          {hiddenVehicleCount > 0 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {hiddenVehicleCount} vehicle{hiddenVehicleCount > 1 ? "s" : ""} not available in {residence}
            </p>
          )}
          </>
        ) : selectedResidenceId ? (
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
      <Sheet open={dateSheetOpen} onOpenChange={setDateSheetOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-3xl px-4 pb-8 pt-5">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-lg font-black">Select rental dates</SheetTitle>
          </SheetHeader>
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
          <div className="sticky bottom-0 -mx-4 mt-4 bg-background/95 px-4 pt-3">
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl font-bold"
              onClick={applyDates}
              disabled={!hasRange || !!calendarError}
            >
              {hasRange ? "Apply dates" : "Pick a date range"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  );
};

export default CarRental;
