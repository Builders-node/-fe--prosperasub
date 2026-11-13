import { useMemo, useRef, useState } from "react";
import { UpsellSection } from "@/components/patterns/UpsellSection";
import { Breadcrumbs } from "@/components/patterns/Breadcrumbs";
import { FavoriteButton } from "@/components/patterns/FavoriteButton";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useParams, useNavigate, Link } from "react-router-dom";
import type { DateRange } from "react-day-picker";
import { differenceInCalendarDays, format } from "date-fns";
import { Users, Fuel, Gauge, Snowflake, Briefcase, Car } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { DateRangePicker, toISO } from "../components/DateRangePicker";
import { PhotoCarousel } from "@/components/patterns/PhotoCarousel";
import { ProductGallery } from "@/components/patterns/ProductGallery";
import { DetailHeader } from "@/components/patterns/DetailHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { DecisionBar } from "@/components/patterns/DecisionBar";
import { ShareButton } from "@/components/patterns/ShareButton";
import { useGoBack } from "@/hooks/useGoBack";
import { useVehicle } from "../hooks/useVehicles";
import { calcRentalPrice, FUEL_LABEL, QUICK_DURATIONS } from "../types/carRental";
import { unitSuffix } from "@/lib/checkout/ctaLabel";
import { formatUSD } from "@/lib/pricing";
import { carPath, carProviderPath } from "../lib/routes";
import { addDays } from "date-fns";
import { useSeo, offerJsonLd } from "@/hooks/useSeo";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: v, isLoading } = useVehicle(id);
  const goBack = useGoBack(carPath());
  const [range, setRange] = useState<DateRange | undefined>();
  const datesRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  const rentalDays = useMemo(() => {
    if (!range?.from || !range?.to) return 0;
    return differenceInCalendarDays(range.to, range.from) + 1;
  }, [range]);

  const pricing = useMemo(() => (v && rentalDays > 0 ? calcRentalPrice(v, rentalDays) : null), [v, rentalDays]);

  /**
   * Above the early returns: a hook after a `return` is the crash the build
   * gate catches. Reads the query, so it runs on the loading pass and simply
   * says nothing until the car arrives.
   */
  useSeo({
    title: v?.name ?? null,
    description: v
      ? v.description ?? ([v.brand, v.model, v.year].filter(Boolean).join(" ") || v.name)
      : null,
    path: v ? carPath(`vehicle/${v.id}`) : null,
    image: v?.image_url ?? v?.gallery_urls?.[0] ?? null,
    type: "product",
    jsonLd: v
      ? offerJsonLd({
          name: v.name,
          description: v.description,
          image: v.image_url ?? v.gallery_urls?.[0] ?? null,
          priceCents: v.daily_price_cents,
          url: carPath(`vehicle/${v.id}`),
          providerName: v.provider?.name ?? null,
        })
      : null,
  });

  if (isLoading) return <AppContainer className="flex justify-center py-24"><Spinner /></AppContainer>;
  if (!v) return (
    <AppContainer className="py-24 text-center">
      <p className="font-semibold text-foreground">Car not found</p>
      <Link to={carPath()} className="mt-3 inline-block text-sm font-semibold text-primary">Back to vehicles</Link>
    </AppContainer>
  );

  const applyQuick = (days: number) => {
    const from = range?.from ?? new Date();
    setRange({ from, to: addDays(from, days - 1) });
  };

  const goBook = () => {
    // No dates yet: take them to the calendar instead of a dead button.
    if (!range?.from || !range?.to) {
      datesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const href = carPath(`book/${v.id}?from=${toISO(range.from)}&to=${toISO(range.to)}`);
    // Signed out: sign in right here and continue to the booking, rather
    // than landing on a bare "please sign in" page.
    if (!isAuthenticated) { openAuthModal("login", href); return; }
    navigate(href);
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

  // "Brand · Model · Year", unless the name already says exactly that — the
  // description renders as its own paragraph below, so no fallback here.
  const specParts = [v.brand, v.model, v.year].filter(Boolean).map(String);
  const specLine = specParts.length && !specParts.every((p) => v.name.toLowerCase().includes(p.toLowerCase()))
    ? specParts.join(" · ")
    : null;

  // Wider first: the section, then the company that rents this car.
  const breadcrumbs = [
    { label: "Vehicles", href: carPath() },
    ...(v.provider?.name && v.provider.id
      ? [{ label: v.provider.name, href: carProviderPath(v.provider.id) }]
      : []),
  ];

  const bookButton = (
    <Button size="lg" variant={pricing ? "primary" : "secondary"} className="w-full font-semibold" onClick={goBook}>
      {pricing ? `Book · ${formatUSD(pricing.totalCents)}` : "Pick your dates"}
    </Button>
  );

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
    <div className="pb-[calc(var(--decision-bar-h,120px)+16px)] md:pb-8">
      {/* The platform's desktop header, as every other detail page has. Its
          absence here was the only reason a car page looked like a different
          product on a laptop. */}
      <DesktopHeader />
      {/* The same bar the plan page uses — one component, not one that
          resembles it. Share rather than a bell: a car is a shop window, and
          the bell belongs on pages about your own account. */}
      <DetailHeader
        title={v.name}
        centreLabel="Vehicles"
        onBack={goBack}
        overPhoto={shots.length > 0}
        rightAction={
          <div className="flex items-center">
            <FavoriteButton kind="vehicle" id={v.id} name={v.name} className="hover:bg-black/10 md:text-foreground" />
            <ShareButton title={v.name} text={shareText} className="hover:bg-black/10 md:text-foreground" />
          </div>
        }
      />

      {/* Phone: the swipeable band. A laptop gets the gallery column below. */}
      <div className="md:hidden">
        <PhotoCarousel
          photos={shots}
          alt={v.name}
          fallback={
            <div className="flex h-[280px] w-full items-center justify-center rounded-b-radius-lg bg-muted">
              <Car className="h-16 w-16 text-muted-foreground/40" />
            </div>
          }
        />
      </div>

      {/* Laptop: every photo on the left (held in view), the car and its dates
          on the right — the same frame as a plan page. */}
      <main className="pt-1 md:mx-auto md:grid md:max-w-[1280px] md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-start md:gap-8 md:px-6 md:py-space-8">
        <ProductGallery photos={shots} alt={v.name} className="hidden md:sticky md:top-24 md:block" />

        <div className="flex flex-col gap-1 md:gap-4">
        <section className="space-y-3 rounded-radius-lg bg-card p-4 shadow-figma">
          <Breadcrumbs items={breadcrumbs} className="-mx-4 px-4" />

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">{v.name}</h1>
            {/* Only when the title has not already said it — most cars are
                named "Brand Model Year", and repeating that directly under the
                h1 was the page's first line of noise. */}
            {specLine && (
              <p className="text-meta leading-4 text-muted-foreground">{specLine}</p>
            )}
            {v.description && (
              <p className="text-title leading-[22px] text-muted-foreground">{v.description}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {specs.map((sp, i) => {
              const Icon = sp.icon;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full bg-inset px-3 py-1.5 text-meta text-muted-foreground"
                >
                  <Icon className="h-3.5 w-3.5" /> {sp.label}
                </span>
              );
            })}
          </div>

        </section>

        <section className="space-y-3 rounded-radius-lg bg-card p-4 shadow-figma">
          <h2 className="text-heading font-semibold text-foreground">Choose your dates</h2>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatUSD(v.daily_price_cents)}
              <span className="text-meta font-normal text-muted-foreground"> / day</span>
            </span>
            {(v.weekly_price_cents > 0 || v.monthly_price_cents > 0) && (
              <span className="text-meta text-muted-foreground">
                {[
                  v.weekly_price_cents > 0 ? `${formatUSD(Math.min(v.weekly_price_cents, v.daily_price_cents > 0 ? v.daily_price_cents * 7 : v.weekly_price_cents))} ${unitSuffix({ period: "weekly" })}` : null,
                  v.monthly_price_cents > 0 ? `${formatUSD(v.monthly_price_cents)} ${unitSuffix({ period: "monthly" })}` : null,
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
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  rentalDays === d.days
                    ? "bg-foreground text-background"
                    : "bg-inset text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div ref={datesRef}>
            <DateRangePicker vehicleId={v.id} value={range} onChange={setRange} />
          </div>

          {pricing && (
            <div className="space-y-1.5 rounded-radius-md bg-inset p-3">
              <div className="flex justify-between text-meta text-muted-foreground">
                <span>{formatUSD(pricing.effectiveDailyRate)} × {pricing.rentalDays} days</span>
                <span className="tabular-nums">{formatUSD(pricing.subtotalCents)}</span>
              </div>
              {pricing.discountCents > 0 && (
                <div className="flex justify-between text-meta text-muted-foreground">
                  <span>Longer-rental discount</span>
                  <span className="tabular-nums text-primary">−{formatUSD(pricing.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-title font-semibold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatUSD(pricing.totalCents)}</span>
              </div>
            </div>
          )}

          {/* Laptop: the action sits under the total it books. */}
          <div className="hidden md:block">{bookButton}</div>
        </section>
        </div>
      </main>

      <UpsellSection
        title="Also for your stay"
        placement="vehicle"
        className="app-container mt-1 py-3 md:mt-4"
        gridClassName="md:grid-cols-2 lg:grid-cols-3"
      />

      {/* Phone: the action pinned to the bottom, carrying the figure. */}
      <DecisionBar className="p-4 shadow-figma md:hidden">
        {bookButton}
      </DecisionBar>

      {/* The site footer, as on every browsing page (it shows from md up). This
          page draws its own header, so the layout that brings the footer is
          not around it. */}
      <SiteFooter />
    </div>
  );
}
