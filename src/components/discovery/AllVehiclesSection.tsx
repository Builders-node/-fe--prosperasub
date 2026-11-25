import { useVehicles, VehicleCard } from "@/features/vehicles";
import { Skeleton } from "@/components/patterns/Skeleton";
import { tr } from "@/lib/tr";

/**
 * Every car on the platform, under the vehicle types on the Vehicles tab —
 * the same shelf card as every plan and car elsewhere (VehicleCard → OfferCard),
 * so the two tabs read the same: kinds first, then everything you can book.
 */
export function AllVehiclesSection() {
  const { data: vehicles = [], isLoading } = useVehicles();
  if (!isLoading && vehicles.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-heading font-semibold text-foreground">{tr("All vehicles")}</h2>
      <div className="grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-square" />)
          : vehicles.map((v) => <VehicleCard key={v.id} v={v} showProvider />)}
      </div>
    </section>
  );
}
