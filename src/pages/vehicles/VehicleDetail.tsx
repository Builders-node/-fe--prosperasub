import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import type { DateRange } from "react-day-picker";
import { differenceInCalendarDays, format } from "date-fns";
import { Users, Fuel, Gauge, Snowflake, Briefcase, Car, ChevronRight } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { DateRangePicker, toISO } from "@/components/DateRangePicker";
import { PhotoCarousel } from "@/components/patterns/PhotoCarousel";
import { DetailHeader } from "@/components/patterns/DetailHeader";
import { ShareButton } from "@/components/ShareButton";
import { useGoBack } from "@/hooks/useGoBack";
import { useVehicle } from "@/hooks/useVehicles";
import { calcRentalPrice, FUEL_LABEL, QUICK_DURATIONS } from "@/types/carRental";
import { formatUSD } from "@/lib/pricing";
import { carPath } from "@/pages/vehicles/routes";
import { addDays } from "date-fns";

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: v, isLoading } = useVehicle(id);
  const goBack = useGoBack(carPath());
  const [range, setRange] = useState<DateRange | undefined>();

  const rentalDays = useMemo(() => {
    if (!range?.from || !range?.to) return 0;
    return differenceInCalendarDays(range.to, range.from) + 1;
  }, [range]);

  const pricing = useMemo(() => (v && rentalDays > 0 ? calcRentalPrice(v, rentalDays) : null), [v, rentalDays]);

  if (isLoading) return <AppContainer className="flex justify-center py-24"><Spinner /></AppContainer>;
  if (!v) return (
    <AppContainer className="py-24 text-center">
      <p className="font-semibold text-foreground">Car not found</p>
      <Link to={carPath()} className="mt-3 inline-block text-sm font-semibold text-primary">Back to the fleet</Link>
    </AppContainer>
  );

  const applyQuick = (days: number) => {
    const from = range?.from ?? new Date();
    setRange({ from, to: addDays(from, days - 1) });
  };

  const goBook = () => {
    if (!range?.from || !range?.to) return;
    navigate(carPath(`book/${v.id}?from=${toISO(range.from)}&to=${toISO(range.to)}`));
  };

  const specs = [
    { icon: Users, label: `${v.seats} seats` },
    { icon: Gauge, label: v.transmission === "automatic" ? "Automatic" : "Manual" },
    { icon: Fuel, label: FUEL_LABEL[v.fuel_type] },
    { icon: Briefcase, label: `${v.luggage_capacity} bags` },
    ...(v.air_conditioning ? [{ icon: Snowflake, label: "Air conditioning" }] : []),
  ];

  // Every picture of this car, cover first — one band instead of a big photo
  // up here and three loose squares further down.
  const shots = [v.image_url, ...(v.gallery_urls ?? [])]
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0);

  const shareText = [v.provider?.name, v.name].filter(Boolean).join(" · ");

  const breadcrumbs = [
    ...(v.provider?.name ? [{ label: v.provider.name, href: carPath() }] : []),
    { label: "Cars", href: carPath() },
  ];

  return (
    /*
      Built as the platform's detail page, not a car-shaped one. The plan page
      this now matches leads with a full-bleed 280px band, puts everything else
      in stacked cards with no side gutter on a phone, and keeps the action in
      a bar pinned to the bottom. This page used to open with a padded photo in
      a rounded box, list its thumbnails as loose squares, and hide its Book
      button somewhere below the fold — three answers to questions the app had
      already answered elsewhere.
    */
    <div className="pb-28 md:pb-8">
      {/* The same bar the plan page uses — one component, not one that
          resembles it. Share rather than a bell: a car is a shop window, and
          the bell belongs on pages about your own account. */}
      <DetailHeader
        title={v.name}
        centreLabel="Car Rental"
        onBack={goBack}
        overPhoto={shots.length > 0}
        rightAction={<ShareButton title={v.name} text={shareText} className="hover:bg-black/10 md:text-foreground" />}
      />

      <PhotoCarousel
        photos={shots}
        alt={v.name}
        fallback={
          <div className="flex h-[280px] w-full items-center justify-center rounded-b-radius-lg bg-muted">
            <Car className="h-16 w-16 text-muted-foreground/40" />
          </div>
        }
      />

      <main className="flex flex-col gap-1 pt-1 md:mx-auto md:max-w-[1280px] md:gap-4 md:px-6 md:py-space-8">
        <section className="space-y-3 rounded-radius-lg bg-card p-4 shadow-figma">
          <nav
            aria-label="Breadcrumb"
            className="-mx-4 flex items-start gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {breadcrumbs.map((crumb) => (
              <Link
                key={crumb.label}
                to={crumb.href}
                className="flex shrink-0 items-start gap-0.5 rounded-radius-md bg-inset py-1 pl-2 pr-1 text-[12px] font-medium leading-4 tracking-[-0.24px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="max-w-[45vw] truncate">{crumb.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Link>
            ))}
          </nav>

          <div className="space-y-2">
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.48px] text-foreground">{v.name}</h1>
            <p className="text-[12px] leading-4 tracking-[-0.24px] text-muted-foreground">
              {[v.brand, v.model, v.year].filter(Boolean).join(" · ")}
            </p>
            {v.description && (
              <p className="text-[16px] leading-[22px] tracking-[-0.32px] text-muted-foreground">{v.description}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {specs.map((sp, i) => {
              const Icon = sp.icon;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full bg-inset px-3 py-1.5 text-[12px] tracking-[-0.24px] text-muted-foreground"
                >
                  <Icon className="h-3.5 w-3.5" /> {sp.label}
                </span>
              );
            })}
          </div>

        </section>

        <section className="space-y-3 rounded-radius-lg bg-card p-4 shadow-figma">
          <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">Choose your dates</h2>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[24px] font-semibold tabular-nums tracking-[-0.48px] text-foreground">
              {formatUSD(v.daily_price_cents)}
              <span className="text-[12px] font-normal tracking-[-0.24px] text-muted-foreground"> / day</span>
            </span>
            {(v.weekly_price_cents > 0 || v.monthly_price_cents > 0) && (
              <span className="text-[12px] tracking-[-0.24px] text-muted-foreground">
                {[
                  v.weekly_price_cents > 0 ? `${formatUSD(v.weekly_price_cents)} / week` : null,
                  v.monthly_price_cents > 0 ? `${formatUSD(v.monthly_price_cents)} / month` : null,
                ].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_DURATIONS.map((d) => (
              <button
                key={d.days}
                type="button"
                onClick={() => applyQuick(d.days)}
                className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  rentalDays === d.days
                    ? "bg-foreground text-background"
                    : "bg-inset text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <DateRangePicker vehicleId={v.id} value={range} onChange={setRange} />

          {pricing && (
            <div className="space-y-1.5 rounded-radius-md bg-inset p-3">
              <div className="flex justify-between text-[12px] tracking-[-0.24px] text-muted-foreground">
                <span>{formatUSD(pricing.effectiveDailyRate)} × {pricing.rentalDays} days</span>
                <span className="tabular-nums">{formatUSD(pricing.subtotalCents)}</span>
              </div>
              {pricing.discountCents > 0 && (
                <div className="flex justify-between text-[12px] tracking-[-0.24px] text-muted-foreground">
                  <span>Longer-rental discount</span>
                  <span className="tabular-nums text-primary">−{formatUSD(pricing.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatUSD(pricing.totalCents)}</span>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* The action, where the platform keeps it: pinned on a phone, in flow on
          a desktop. It also carries the figure, so the price is still on screen
          at the moment of deciding. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 rounded-t-radius-lg bg-card p-4 shadow-figma md:static md:mx-auto md:mt-4 md:max-w-[1280px] md:rounded-radius-lg md:px-6">
        <Button className="h-12 w-full text-[16px] font-semibold" disabled={!pricing} onClick={goBook}>
          {pricing
            ? `Book · ${formatUSD(pricing.totalCents)}`
            : "Pick your dates"}
        </Button>
      </div>
    </div>
  );
}
