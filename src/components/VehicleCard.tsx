import { Link } from "react-router-dom";
import { Car, Users, Fuel, Gauge, Snowflake } from "lucide-react";
import { formatUSD } from "@/lib/pricing";
import { FUEL_LABEL, type RentalVehicle } from "@/types/carRental";
import { carPath } from "@/pages/vehicles/routes";

/**
 * A car in the fleet grid. One white card, 16px radius, one shadow. Image on
 * top; title 16px semibold; the spec line is the single 12px grey slot; price
 * pinned bottom-left in tabular numerals. Per DESIGN.md §1, §3.
 */
export function VehicleCard({ v }: { v: RentalVehicle }) {
  const specs = [
    { icon: Users, label: String(v.seats) },
    { icon: Gauge, label: v.transmission === "automatic" ? "Auto" : "Manual" },
    { icon: Fuel, label: FUEL_LABEL[v.fuel_type] },
    ...(v.air_conditioning ? [{ icon: Snowflake, label: "A/C" }] : []),
  ];
  return (
    <Link
      to={carPath(`vehicle/${v.id}`)}
      className="group flex flex-col overflow-hidden rounded-radius-md bg-card shadow-figma tracking-[-0.02em] transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-inset">
        {v.image_url ? (
          <img src={v.image_url} alt={v.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Car className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}
        {v.status !== "public" && (
          <span className="absolute left-3 top-3 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">
            {v.status}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">{v.name}</p>
        <p className="mt-0.5 truncate text-[12px] tracking-[-0.24px] text-muted-foreground">
          {[v.brand, v.model, v.year].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
          {specs.map((s, i) => {
            const Icon = s.icon;
            return <span key={i} className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{s.label}</span>;
          })}
        </div>
        <div className="mt-3 flex items-end justify-between">
          <span className="text-[16px] font-semibold tabular-nums tracking-[-0.32px] text-foreground">
            {formatUSD(v.daily_price_cents)}
            <span className="text-[12px] font-normal text-muted-foreground"> / day</span>
          </span>
          <span className="rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground">Book</span>
        </div>
      </div>
    </Link>
  );
}
