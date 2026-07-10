import { ArrowRight, Users, Luggage, Zap, Wind, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";
import type { RentalVehicle, RentalVehicleImage } from "@/types/carRental";

const transmissionLabel = (t: string) => (t === "automatic" ? "Automatic" : "Manual");
const fuelLabel = (f: string) =>
  ({ gasoline: "Gasoline", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid" }[f] ?? f);

/**
 * Vehicle card — matches the unified borderless / single-accent aesthetic used
 * by CleaningPackageCard and FoodProviderDetail's MealPlanCard.
 *
 * - Featured = filled `bg-primary/10`, not a border
 * - No border on the default state (canonical flat card)
 * - "Most Popular" is a compact overline pill
 * - CTA is `rounded-2xl h-12` (matches Cart / checkouts)
 */
export function RentalVehicleCard({
  v, featured = false, onOpen,
}: {
  v: RentalVehicle & { images: RentalVehicleImage[] };
  featured?: boolean;
  onOpen: (id: string) => void;
}) {
  const photos = v.images.slice(0, 3).map((i) => i.url);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(v.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(v.id); } }}
      className={`group flex cursor-pointer flex-col rounded-3xl p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        featured ? "bg-primary/10 hover:bg-primary/15" : "bg-card hover:bg-muted/40"
      }`}
    >
      {photos.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {photos.map((url, i) => (
            <div
              key={i}
              className={`relative aspect-square overflow-hidden rounded-xl bg-muted ${
                photos.length === 1 ? "col-span-3 aspect-[16/9]" : ""
              }`}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {i === 2 && v.images.length > 3 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
                  +{v.images.length - 3}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {featured && (
        <span className="mb-2 self-start rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
          Most Popular
        </span>
      )}

      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {v.brand} · {v.year}
      </p>
      <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">{v.name}</h3>

      {v.description && (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {v.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Users className="h-3 w-3" /> {v.seats}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Luggage className="h-3 w-3" /> {v.luggage_capacity}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Zap className="h-3 w-3" /> {fuelLabel(v.fuel_type)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Car className="h-3 w-3" /> {transmissionLabel(v.transmission)}
        </span>
        {v.air_conditioning && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Wind className="h-3 w-3" /> A/C
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-2xl font-black tabular-nums text-foreground">
          {formatUSD(v.daily_price_cents)}
        </span>
        <span className="text-sm text-muted-foreground">/ day</span>
      </div>

      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
        <Button size="lg" className="h-12 w-full rounded-2xl text-base font-bold" onClick={() => onOpen(v.id)}>
          Details <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
