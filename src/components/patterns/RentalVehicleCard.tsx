import { Users, Luggage, Zap, Wind, Car } from "lucide-react";
import { PlanCard } from "@/components/patterns/PlanCard";
import type { RentalVehicle, RentalVehicleImage } from "@/types/carRental";

const transmissionLabel = (t: string) => (t === "automatic" ? "Automatic" : "Manual");
const fuelLabel = (f: string) =>
  ({ gasoline: "Gasoline", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid" }[f] ?? f);

/**
 * A `rental_vehicles` row as a plan card.
 *
 * This used to be the sixth hand-written copy of the card — its own photo
 * grid, its own chips, its own price block, its own Details button — which is
 * why the rental listing kept drifting away from the other three. Now it only
 * knows what rental's columns mean; PlanCard draws it.
 */
export function RentalVehicleCard({
  v, featured = false, onOpen,
}: {
  v: RentalVehicle & { images: RentalVehicleImage[] };
  featured?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <PlanCard
      title={v.name}
      eyebrow={{ text: `${v.brand} · ${v.year}` }}
      description={v.description}
      photos={v.images.map((i) => i.url)}
      featured={featured}
      chips={[
        { icon: Users, label: `${v.seats} seats` },
        { icon: Luggage, label: `${v.luggage_capacity} bags` },
        { icon: Zap, label: fuelLabel(v.fuel_type) },
        { icon: Car, label: transmissionLabel(v.transmission) },
        ...(v.air_conditioning ? [{ icon: Wind, label: "A/C" }] : []),
      ]}
      price={{ cents: v.daily_price_cents, unit: "/ day" }}
      cta={{ label: "Details", onClick: () => onOpen(v.id) }}
    />
  );
}
