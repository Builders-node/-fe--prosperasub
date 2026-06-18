import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Car, Users, Luggage, Zap, Wind, ArrowRight, CalendarDays, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RentalCalendar } from "@/components/rental/RentalCalendar";
import { formatUSD } from "@/lib/pricing";
import {
  YdHero, YdIllustration, YdChip, YdEmptyState,
} from "@/components/yd/YdPrimitives";
import type { RentalVehicle, RentalVehicleImage } from "@/types/carRental";

const transmissionLabel = (t: string) => (t === "automatic" ? "Automatic" : "Manual");
const fuelLabel = (f: string) =>
  ({ gasoline: "Gasoline", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid" }[f] ?? f);

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

  const { data: vehicles, isLoading } = useQuery({
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

      return vData.map((v: RentalVehicle) => ({ ...v, images: imgMap[v.id] ?? [] }));
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Car Rental" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-space-4 md:py-space-8">

        {/* Hero */}
        <YdHero
          accent="orange"
          badge="Car Rental"
          badgeIcon={Car}
          title="Find your ride"
          subtitle="Quality vehicles, transparent daily rates. No hidden fees, weekly & monthly available."
          illustration={<YdIllustration icon={Car} accent="orange" size="lg" />}
        />

        {/* Date filter bar (Yandex Prokat style) */}
        <button
          type="button"
          onClick={() => setDateSheetOpen(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left transition-colors hover:bg-muted/30"
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

        {/* Vehicle grid */}
        {isLoading ? (
          <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[380px] animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : vehicles && vehicles.length > 0 ? (
          <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleCard key={v.id} v={v} onClick={() => navigate(`/cars/${v.id}${datesQuery()}`)} />
            ))}
          </div>
        ) : (
          <YdEmptyState
            icon={Car}
            title="No vehicles available"
            subtitle="Our fleet is being prepared — check back soon."
          />
        )}
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

// ─── Vehicle card ─────────────────────────────────────────────────────────────
function VehicleCard({
  v,
  onClick,
}: {
  v: RentalVehicle & { images: RentalVehicleImage[] };
  onClick: () => void;
}) {
  const thumb = v.images[0]?.url;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl
                 
                 transition-all duration-200 ease-out
                 motion-safe:hover:scale-[1.01] hover:border-orange-500/40
                 hover:
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
    >
      {/* Vehicle image */}
      <div className="relative h-44 w-full overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt={v.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center ">
            <YdIllustration icon={Car} accent="orange" size="lg" />
          </div>
        )}
        {/* Discount pill */}
        {v.monthly_discount_pct > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-950">
            -{v.monthly_discount_pct}% /mo
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-300">
          {v.brand} · {v.year}
        </p>
        <h2 className="mt-1 text-lg font-black tracking-tight text-foreground leading-tight">
          {v.name}
        </h2>
        {v.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {v.description}
          </p>
        )}

        {/* Spec chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <YdChip icon={Users} label={`${v.seats}`} />
          <YdChip icon={Luggage} label={`${v.luggage_capacity}`} />
          <YdChip icon={Zap} label={fuelLabel(v.fuel_type)} />
          <YdChip icon={Car} label={transmissionLabel(v.transmission)} />
          {v.air_conditioning && <YdChip icon={Wind} label="A/C" />}
        </div>

        {/* Price + CTA */}
        <div className="mt-4 flex items-end justify-between gap-3 pt-3 border-t border-border/60">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tabular-nums text-foreground">
              {formatUSD(v.daily_price_cents)}
            </span>
            <span className="text-xs text-muted-foreground">/day</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white
                           transition-transform duration-200 group-hover:translate-x-0.5">
            Details
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}

export default CarRental;
