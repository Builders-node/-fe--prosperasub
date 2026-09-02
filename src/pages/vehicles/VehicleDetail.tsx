import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import type { DateRange } from "react-day-picker";
import { differenceInCalendarDays, format } from "date-fns";
import { Users, Fuel, Gauge, Snowflake, Briefcase, Car } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { DateRangePicker, toISO } from "@/components/DateRangePicker";
import { useVehicle } from "@/hooks/useVehicles";
import { calcRentalPrice, FUEL_LABEL, QUICK_DURATIONS } from "@/types/carRental";
import { formatUSD } from "@/lib/pricing";
import { carPath } from "@/pages/vehicles/routes";
import { addDays } from "date-fns";

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: v, isLoading } = useVehicle(id);
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

  return (
    <AppContainer className="py-6">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Left: photos + specs */}
        <div className="space-y-4">
          <div className="aspect-[16/10] w-full overflow-hidden rounded-radius-lg bg-inset">
            {v.image_url ? (
              <img src={v.image_url} alt={v.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center"><Car className="h-16 w-16 text-muted-foreground/40" /></div>
            )}
          </div>
          {v.gallery_urls?.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {v.gallery_urls.slice(0, 8).map((u, i) => (
                <img key={i} src={u} alt="" className="aspect-square w-full rounded-radius-sm object-cover" />
              ))}
            </div>
          )}
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-foreground">{v.name}</h1>
            <p className="text-sm text-muted-foreground">{[v.brand, v.model, v.year].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {specs.map((s, i) => {
              const Icon = s.icon;
              return (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-inset px-3 py-1.5 text-[13px] font-medium text-foreground">
                  <Icon className="h-4 w-4 text-muted-foreground" /> {s.label}
                </span>
              );
            })}
          </div>
          {v.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{v.description}</p>}
        </div>

        {/* Right: dates + price */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-radius-md bg-card p-4 shadow-figma">
            <div className="mb-3 flex items-baseline gap-1">
              <span className="text-[22px] font-semibold tabular-nums tracking-[-0.4px] text-foreground">{formatUSD(v.daily_price_cents)}</span>
              <span className="text-sm text-muted-foreground">/ day</span>
              {v.weekly_price_cents > 0 && <span className="ml-auto text-xs text-muted-foreground">{formatUSD(v.weekly_price_cents)}/wk</span>}
              {v.monthly_price_cents > 0 && <span className="text-xs text-muted-foreground">· {formatUSD(v.monthly_price_cents)}/mo</span>}
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {QUICK_DURATIONS.map((q) => (
                <button key={q.label} onClick={() => applyQuick(q.days)}
                  className="rounded-full bg-inset px-3 py-1 text-[12px] font-semibold tracking-[-0.24px] text-foreground hover:bg-muted">
                  {q.label}
                </button>
              ))}
            </div>

            <DateRangePicker vehicleId={v.id} value={range} onChange={setRange} />

            {pricing && range?.from && range?.to && (
              <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>{format(range.from, "MMM d")} → {format(range.to, "MMM d")} · {rentalDays} day{rentalDays > 1 ? "s" : ""}</span>
                </div>
                {pricing.discountCents > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Multi-day discount</span>
                    <span className="text-primary">−{formatUSD(pricing.discountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[16px] font-semibold text-foreground">
                  <span>Total</span><span className="tabular-nums">{formatUSD(pricing.totalCents)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatUSD(pricing.effectiveDailyRate)}/day effective{pricing.capped ? " · monthly cap applied" : ""}
                </p>
              </div>
            )}

            <Button className="mt-4 w-full" disabled={!pricing} onClick={goBook}>
              {pricing ? `Continue · ${formatUSD(pricing.totalCents)}` : "Select your dates"}
            </Button>
          </div>
        </div>
      </div>
    </AppContainer>
  );
}
