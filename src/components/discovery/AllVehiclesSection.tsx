import { Link } from "react-router-dom";
import { Car } from "lucide-react";
import { carPath, useVehicles } from "@/features/vehicles";
import { Photo } from "@/components/patterns/Photo";
import { Skeleton } from "@/components/patterns/Skeleton";
import { formatUSD } from "@/lib/pricing";

/**
 * Every car on the platform, under the vehicle types on the Vehicles tab —
 * the same grid and card the Experiences tab uses for "All plans", so the two
 * tabs read the same: kinds first, then everything you can book.
 */
export function AllVehiclesSection() {
  const { data: vehicles = [], isLoading } = useVehicles();
  if (!isLoading && vehicles.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-heading font-semibold text-foreground">All vehicles</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[220px]" />)
          : vehicles.map((v) => (
              <Link
                key={v.id}
                to={carPath(`vehicle/${v.id}`)}
                className="flex flex-col overflow-hidden rounded-radius-md bg-card shadow-figma transition-colors active:scale-[0.98] hover:bg-muted/40"
              >
                <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-muted">
                  <Photo src={v.image_url ?? v.gallery_urls?.[0] ?? null} icon={Car} className="absolute inset-0" />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-title font-semibold text-foreground">{v.name}</p>
                  {v.provider?.name && <p className="line-clamp-1 text-meta text-muted-foreground">{v.provider.name}</p>}
                  {v.daily_price_cents > 0 && (
                    <p className="mt-auto pt-1 text-body font-semibold text-foreground">
                      {formatUSD(v.daily_price_cents)}
                      <span className="font-normal text-muted-foreground"> / day</span>
                    </p>
                  )}
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}
