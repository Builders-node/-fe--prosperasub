import { useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Car, Users, Luggage, Zap, Wind, ChevronLeft, ChevronRight,
  MapPin, Clock, FileText, CalendarDays, ShieldCheck, Gauge,
  CheckCircle2, ArrowRight,
} from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RentalCalendar } from "@/components/rental/RentalCalendar";
import { formatUSD } from "@/lib/pricing";
import { YdIllustration } from "@/components/yd/YdPrimitives";
import type {
  RentalVehicle, RentalVehicleImage,
  RentalDeliverySettings, RentalDeliveryZone, RentalInsuranceTier,
} from "@/types/carRental";

const FALLBACK_INSURANCE_TIERS: RentalInsuranceTier[] = [
  { id: "basic",    name: "Basic",    price_per_day_cents: 0,    items: ["Collision, rollover, self-ignition", "Legal assistance"], sort_order: 1, is_active: true, created_at: "", updated_at: "" },
  { id: "plus",     name: "Plus",     price_per_day_cents: 1000, items: ["All Basic coverage", "Civil liability (property)", "Theft protection", "Force majeure", "Seniors (60-75 yrs)", "Fuel service (deferred)"], sort_order: 2, is_active: true, created_at: "", updated_at: "" },
  { id: "platinum", name: "Platinum", price_per_day_cents: 2000, items: ["All Plus coverage", "Occupant medical", "Glass & tyre protection", "Occupant insurance", "Civil liability (persons)"], sort_order: 3, is_active: true, created_at: "", updated_at: "" },
];

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

const CarDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [imgIndex, setImgIndex] = useState(0);

  // ─── Date selection state (pre-filled from the listing filter via URL) ──────
  const [searchParams] = useSearchParams();
  const [startDate, setStartDate] = useState(() => searchParams.get("start") ?? "");
  const [endDate, setEndDate] = useState(() => searchParams.get("end") ?? "");
  const [startTime, setStartTime] = useState(() => searchParams.get("startTime") ?? "09:00");
  const [endTime, setEndTime] = useState(() => searchParams.get("endTime") ?? "09:00");
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [insuranceOpen, setInsuranceOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["rental-vehicle", id],
    queryFn: async () => {
      const { data: v, error } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .eq("id", id)
        .eq("status", "public")
        .single();
      if (error) throw error;

      const { data: imgs } = await supabaseDb
        .from("rental_vehicle_images")
        .select("*")
        .eq("vehicle_id", id)
        .order("sort_order", { ascending: true });

      return { ...(v as RentalVehicle), images: (imgs ?? []) as RentalVehicleImage[] };
    },
    enabled: !!id,
  });

  const { data: delivery } = useQuery({
    queryKey: ["rental-delivery-settings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_delivery_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) return null;
      return data as RentalDeliverySettings;
    },
  });

  const { data: deliveryZones = [] } = useQuery({
    queryKey: ["rental-delivery-zones"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_delivery_zones")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return [];
      return data as RentalDeliveryZone[];
    },
  });

  const { data: insuranceTiers = FALLBACK_INSURANCE_TIERS } = useQuery({
    queryKey: ["rental-insurance-tiers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_insurance_tiers")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error || !data || data.length === 0) return FALLBACK_INSURANCE_TIERS;
      return data as RentalInsuranceTier[];
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <HomeHeader title="Car Details" showBackButton onBack={() => navigate("/services/rental")} />
        <DesktopHeader />
        <main className="market-content py-space-6">
          <div className="h-72 animate-pulse rounded-3xl bg-muted" />
          <div className="mt-4 h-8 w-48 animate-pulse rounded-xl bg-muted" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
        </main>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background">
        <HomeHeader title="Car Details" showBackButton onBack={() => navigate("/services/rental")} />
        <DesktopHeader />
        <main className="market-content py-space-10 text-center">
          <Car className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold">Vehicle not found</p>
          <Button asChild variant="secondary" className="mt-4">
            <Link to="/services/rental">Back to fleet</Link>
          </Button>
        </main>
      </div>
    );
  }

  const images = vehicle.images ?? [];

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-32">
      <HomeHeader title={vehicle.name} showBackButton onBack={() => navigate("/services/rental")} />
      <DesktopHeader />

      <main className="market-content py-4 md:py-8">

        {/* ─── Step indicator (mobile only — desktop shows it inside right column) ─── */}
        <section className="lg:hidden mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">
            Step 1 of 2
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">
            Book your car
          </h1>
        </section>

        {/* ─── Adaptive 2-column layout (Yandex desktop pattern) ───── */}
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-8 lg:items-start">

          {/* ─── LEFT COLUMN: Image + car summary (sticky on desktop) ── */}
          <div className="space-y-4 lg:sticky lg:top-24">

            {/* ─── Hero image gallery ───────────────────────────────── */}
            <section className="relative overflow-hidden rounded-3xl bg-muted" style={{ aspectRatio: "16/10" }}>
          {images.length > 0 ? (
            <>
              <img
                src={images[imgIndex].url}
                alt={`${vehicle.name} photo ${imgIndex + 1}`}
                className="h-full w-full object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setImgIndex((i) => (i - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition hover:bg-background"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImgIndex((i) => (i + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition hover:bg-background"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  {/* Index pill */}
                  <span className="absolute right-3 bottom-3 rounded-full bg-background/80 backdrop-blur-sm px-2.5 py-1 text-xs font-bold text-foreground">
                    {imgIndex + 1} / {images.length}
                  </span>
                  {/* Dots */}
                  <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setImgIndex(i)}
                        className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                        aria-label={`Go to image ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center ">
              <YdIllustration icon={Car} accent="orange" size="lg" />
            </div>
          )}
            </section>

            {/* ─── Car info card (under image on both layouts) ─────── */}
            <section className="overflow-hidden rounded-3xl bg-card">
              <InfoRow
                icon={<Car className="h-5 w-5 text-muted-foreground" />}
                caption={`${transmissionLabel(vehicle.transmission)} · ${fuelLabel(vehicle.fuel_type)}`}
                title={`${vehicle.brand} ${vehicle.model} ${vehicle.year}`}
                sublink="Car details and specs"
              />
            </section>
          </div>

          {/* ─── RIGHT COLUMN: Booking info + sections ─────────────── */}
          <div className="space-y-4">

            {/* Desktop-only step indicator at the top of right column */}
            <section className="hidden lg:block">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">
                Step 1 of 2
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground">
                Book your car
              </h1>
            </section>

            {/* ─── Dates + Price card ─────────────────────────────── */}
            <section className="overflow-hidden rounded-3xl bg-card">
              <button
                type="button"
                onClick={() => setDateSheetOpen(true)}
                className="block w-full text-left transition-colors hover:bg-muted/30"
              >
                <InfoRow
                  icon={<CalendarDays className="h-5 w-5 text-muted-foreground" />}
                  title={
                    startDate && endDate
                      ? `${format(parseISO(startDate), "MMM d")} → ${format(parseISO(endDate), "MMM d, yyyy")}`
                      : "Daily, weekly or monthly"
                  }
                  caption={
                    startDate && endDate
                      ? `${fmt12(startTime)} → ${fmt12(endTime)}`
                      : undefined
                  }
                  sublink={
                    startDate && endDate ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        {Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)))} day rental
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Available now · tap to select
                      </span>
                    )
                  }
                  chevron
                />
              </button>
              <PriceRow vehicle={vehicle} />
            </section>

            {/* ─── Requirements & terms section ──────────────────── */}
        <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">
          Requirements & terms
        </h2>
        <section className="overflow-hidden rounded-3xl bg-card">
          <InfoRow
            icon={<Users className="h-5 w-5 text-muted-foreground" />}
            title="Minimum driver requirements"
            caption="18 years old · valid driving license"
          />
          <InfoRow
            icon={<FileText className="h-5 w-5 text-muted-foreground" />}
            title="Required documents"
            chevron
            onClick={() => setDocsOpen(true)}
          />
        </section>

        {/* ─── Insurance ───────────────────────────────────────────── */}
        <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">Insurance</h2>
        <section className="overflow-hidden rounded-3xl bg-card">
          <button
            type="button"
            onClick={() => setInsuranceOpen(true)}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-foreground leading-tight">Basic liability coverage</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Included in rental price · <span className="text-orange-400">More</span>
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        </section>

        {/* ─── Vehicle specs ──────────────────────────────────────── */}
        <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">Vehicle specs</h2>
        <section className="overflow-hidden rounded-3xl bg-card divide-y divide-border/60">
          <SpecRow icon={<Users className="h-4 w-4" />} label="Seats" value={`${vehicle.seats}`} />
          <SpecRow icon={<Luggage className="h-4 w-4" />} label="Luggage" value={`${vehicle.luggage_capacity} bag${vehicle.luggage_capacity !== 1 ? "s" : ""}`} />
          <SpecRow icon={<Gauge className="h-4 w-4" />} label="Transmission" value={transmissionLabel(vehicle.transmission)} />
          <SpecRow icon={<Zap className="h-4 w-4" />} label="Fuel" value={fuelLabel(vehicle.fuel_type)} />
          <SpecRow icon={<Wind className="h-4 w-4" />} label="Air conditioning" value={vehicle.air_conditioning ? "Yes" : "No"} />
        </section>

        {/* ─── Delivery & pickup ──────────────────────────────────── */}
        {(delivery || deliveryZones.length > 0) && (
          <>
            <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">
              Pickup & delivery
            </h2>
            <section className="overflow-hidden rounded-3xl bg-card">
              {deliveryZones.length > 0 && (
                <button
                  type="button"
                  onClick={() => setZonesOpen(true)}
                  className="flex w-full items-center gap-4 border-b border-border/60 p-4 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground">Delivery zones</p>
                    <p className="text-sm text-muted-foreground">
                      {deliveryZones.length} zone{deliveryZones.length !== 1 ? "s" : ""}
                      {deliveryZones.some((z) => z.fee_cents === 0) && (
                        <span className="text-emerald-400"> · Free pickup available</span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </button>
              )}
              {delivery?.pickup_instructions && (
                <InfoRow
                  icon={<Clock className="h-5 w-5 text-muted-foreground" />}
                  title="Pickup instructions"
                  caption={delivery.pickup_instructions}
                />
              )}
              {delivery?.terms_and_conditions && (
                <InfoRow
                  icon={<FileText className="h-5 w-5 text-muted-foreground" />}
                  title="Terms & conditions"
                  caption={delivery.terms_and_conditions}
                />
              )}
            </section>
          </>
        )}

            {/* ─── Description ──────────────────────────────────── */}
            {vehicle.description && (
              <>
                <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">
                  About this car
                </h2>
                <section className="rounded-3xl bg-card p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {vehicle.description}
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ─── Sticky bottom bar (Yandex-style) ──────────────────────── */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 bg-background border-t border-border/40 md:left-[var(--sidebar-width,0px)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="market-content px-4 py-3">
          <div className="flex items-center justify-center gap-2 mb-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Free cancellation · 24h before pickup
          </div>
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl font-bold text-base"
            onClick={() => {
              if (!startDate || !endDate) {
                setDateSheetOpen(true);
                return;
              }
              const params = new URLSearchParams({
                start: startDate,
                end: endDate,
                startTime,
                endTime,
              });
              navigate(`/services/rental/${vehicle.id}/book?${params.toString()}`);
            }}
          >
            {startDate && endDate ? "Continue" : "Select dates"}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {startDate && endDate ? "Only one step left" : "Tap to choose your rental dates"}
          </p>
        </div>
      </div>

      {/* ─── Delivery zones modal ──────────────────────────────────────────── */}
      <Dialog open={zonesOpen} onOpenChange={setZonesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delivery zones</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto">
            {deliveryZones.map((z) => (
              <div key={z.id} className="flex items-start justify-between gap-3 rounded-2xl bg-muted/40 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{z.name}</p>
                  {z.areas && <p className="text-xs leading-snug text-muted-foreground">{z.areas}</p>}
                </div>
                <span className={`shrink-0 text-sm font-black tabular-nums ${
                  z.fee_cents === 0 ? "text-emerald-400" :
                  z.fee_cents >= 4000 ? "text-red-400" :
                  "text-yellow-400"
                }`}>
                  {z.fee_cents === 0 ? "FREE" : formatUSD(z.fee_cents)}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Insurance modal ───────────────────────────────────────────────── */}
      <Dialog open={insuranceOpen} onOpenChange={setInsuranceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insurance coverage</DialogTitle>
          </DialogHeader>
          <p className="-mt-1 text-sm text-muted-foreground">
            Basic liability is included in every rental. Upgrade for extra protection at checkout.
          </p>
          <div className="space-y-3 overflow-y-auto">
            {insuranceTiers.map((tier) => (
              <div key={tier.id} className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-black text-foreground">{tier.name}</p>
                  <span className={`shrink-0 text-sm font-black tabular-nums ${tier.price_per_day_cents === 0 ? "text-emerald-400" : "text-foreground"}`}>
                    {tier.price_per_day_cents === 0 ? "Included" : `${formatUSD(tier.price_per_day_cents)} / day`}
                  </span>
                </div>
                {tier.items?.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {tier.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Required documents modal ──────────────────────────────────────── */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Required documents</DialogTitle>
          </DialogHeader>
          <p className="-mt-1 text-sm text-muted-foreground">
            Please bring the following when you pick up your vehicle:
          </p>
          <ul className="space-y-2.5">
            {[
              "Valid driver's license",
              "Booking confirmation (digital or printed)",
              "Credit card for the security deposit",
              "Government-issued ID or passport",
            ].map((doc) => (
              <li key={doc} className="flex items-start gap-3 rounded-2xl bg-muted/40 px-3.5 py-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                <span className="text-sm text-foreground">{doc}</span>
              </li>
            ))}
          </ul>
          {delivery?.pickup_instructions && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {delivery.pickup_instructions}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Date selection sheet (Yandex Прокат "Select rental dates" modal) ─── */}
      <Sheet open={dateSheetOpen} onOpenChange={setDateSheetOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-3xl px-4 pb-8 pt-5">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-lg font-black">Select rental dates</SheetTitle>
          </SheetHeader>
          {id && (
            <>
              <RentalCalendar
                vehicleId={id}
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
                <p className="mt-3 text-center text-sm font-medium text-destructive">
                  {calendarError}
                </p>
              )}
              <div className="sticky bottom-0 -mx-4 mt-4 bg-background/95 px-4 pt-3 ">
                <Button
                  size="lg"
                  className="w-full h-12 rounded-2xl font-bold"
                  onClick={() => setDateSheetOpen(false)}
                  disabled={!startDate || !endDate || !!calendarError}
                >
                  {startDate && endDate ? "Apply" : "Pick a date range"}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

// ─── Yandex-style grouped row ─────────────────────────────────────────────────
function InfoRow({
  icon, title, caption, sublink, chevron, onClick,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  caption?: React.ReactNode;
  sublink?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex w-full items-start gap-3 border-b border-border/60 p-4 text-left last:border-0 ${onClick ? "transition-colors hover:bg-muted/40" : ""}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        {caption && typeof caption === "string" && (
          <p className="text-xs text-muted-foreground">{caption}</p>
        )}
        {caption && typeof caption !== "string" && (
          <div className="text-xs text-muted-foreground">{caption}</div>
        )}
        <p className={`font-bold text-foreground leading-tight ${caption ? "mt-0.5" : ""}`}>
          {title}
        </p>
        {sublink && (
          <div className="mt-1 text-sm text-orange-400">{sublink}</div>
        )}
      </div>
      {chevron && (
        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </Tag>
  );
}

// ─── Price row (special inline format) ────────────────────────────────────────
function PriceRow({ vehicle }: { vehicle: RentalVehicle }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground leading-tight">Daily rate</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm tabular-nums text-emerald-400 font-bold">
            {formatUSD(vehicle.daily_price_cents)} / day
          </span>
          {vehicle.weekly_price_cents > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              · {formatUSD(vehicle.weekly_price_cents)} / wk
            </span>
          )}
          {vehicle.monthly_price_cents > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              · {formatUSD(vehicle.monthly_price_cents)} / mo
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xl font-black tabular-nums text-foreground leading-none">
          {formatUSD(vehicle.daily_price_cents)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">starting</p>
      </div>
    </div>
  );
}

// ─── Spec row ─────────────────────────────────────────────────────────────────
function SpecRow({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}

export default CarDetail;
